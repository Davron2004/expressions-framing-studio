"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Copy,
  Layers3,
  MoveUpRight,
  RotateCcw,
  Ruler,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  Configuration,
  Quote,
  defaultConfiguration,
  dimensions,
  frames,
  mats,
  money,
  samples,
  sizes,
} from "@/lib/catalog";
const FramePreview = dynamic(() => import("./frame-preview"), {
  ssr: false,
  loading: () => (
    <div className="preview-loading">
      <LoaderCircle className="spin" />
      <span>Preparing your canvas</span>
    </div>
  ),
});
type Section = "photo" | "size" | "frame" | "mat";
const sectionLabels: Record<Section, string> = {
  photo: "Your photograph",
  size: "Find your size",
  frame: "Choose your frame",
  mat: "Give it some space",
};
export default function Studio() {
  const [config, setConfig] = useState<Configuration>(defaultConfiguration);
  const [section, setSection] = useState<Section>("frame");
  const [mode, setMode] = useState<"studio" | "room">("studio");
  const [exploded, setExploded] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cardCopied, setCardCopied] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [wall, setWall] = useState(0);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idempotency = useRef<string | null>(null);
  const reduce = useReducedMotion();
  const designRef = useRef({ config, quote });
  useEffect(() => {
    designRef.current = { config, quote };
  }, [config, quote]);
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!ctx) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        ctx.registerTool(
          {
            name: "get_frame_design",
            description:
              "Read the currently visible framing options and server-calculated CAD price. Does not place an order or reveal uploaded image bytes.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                Object.keys(input).length
              )
                throw new Error("Expected an empty object.");
              const { photo, ...options } = designRef.current.config;
              return { configuration: options, quote: designRef.current.quote };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  const currentFrame = frames.find((f) => f.id === config.frame)!;
  const currentSize = sizes.find((s) => s.id === config.size)!;
  const currentMat = mats.find((m) => m.id === config.mat)!;
  const dim = dimensions(config);
  function update(patch: Partial<Configuration>) {
    setConfig((c) => {
      const next = { ...c, ...patch };
      if (next.mat === "none") next.bottomWeighted = false;
      return next;
    });
    setError("");
    idempotency.current = null;
  }
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("ei-configuration");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          sizes.some((s) => s.id === parsed.size) &&
          frames.some((f) => f.id === parsed.frame) &&
          mats.some((m) => m.id === parsed.mat) &&
          [1.5, 2, 3].includes(parsed.matWidth) &&
          typeof parsed.bottomWeighted === "boolean" &&
          typeof parsed.photo === "string" &&
          typeof parsed.photoName === "string"
        )
          setConfig({
            ...parsed,
            bottomWeighted:
              parsed.mat === "none" ? false : parsed.bottomWeighted,
          });
      }
    } catch {}
    setReady(true);
    if (
      new URLSearchParams(window.location.search).get("checkout") ===
      "cancelled"
    )
      setError(
        "Your design is right where you left it. Checkout was cancelled; no payment was taken.",
      );
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem("ei-configuration", JSON.stringify(config));
    } catch {}
    const ctrl = new AbortController();
    setQuoteLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Could not update your price.");
        setQuote(data);
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") {
          setQuote(null);
          setError(
            "We couldn’t update the price. Please try another option or refresh.",
          );
        }
      } finally {
        if (!ctrl.signal.aborted) setQuoteLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [config, ready]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [expanded]);
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG or WebP photograph.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Choose a photograph smaller than 20 MB.");
      return;
    }
    setUploading(true);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const photo = canvas.toDataURL("image/jpeg", 0.86);
      if (photo.length > 2700000) throw new Error();
      update({
        photo,
        photoName: file.name.replace(/\.[^.]+$/, "").slice(0, 80),
      });
    } catch {
      setError(
        "That photograph couldn’t be opened. Try a different JPG or PNG.",
      );
    } finally {
      setUploading(false);
    }
  }
  async function checkout() {
    if (busy || quoteLoading || !quote) return;
    setBusy(true);
    setError("");
    try {
      idempotency.current ||= crypto.randomUUID();
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configuration: config,
          idempotencyKey: idempotency.current,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error || "Checkout couldn’t open. Please try again.",
        );
      window.location.assign(data.url);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Checkout couldn’t open. Please try again.",
      );
      setBusy(false);
    }
  }
  const wallColors = ["#d7d8ce", "#b3b9a5", "#656e66"];
  return (
    <div className="studio-app">
      <div className="announcement">
        <span>A little perspective. A whole new feeling.</span>
        <span>
          Interactive demo <span className="announcement-dot">·</span> Test
          payments only
        </span>
      </div>
      <header className="site-header">
        <Link
          href="/"
          className="brand"
          aria-label="Expressions and Images home"
        >
          <span className="brand-monogram">
            E<span>&</span>I
          </span>
          <span className="brand-name">
            EXPRESSIONS <span>& IMAGES</span>
          </span>
        </Link>
        <nav>
          <span className="nav-active">The framing studio</span>
          <Link href="/orders">
            Your orders <ArrowUpRight size={14} />
          </Link>
        </nav>
        <span className="heritage">
          A nod to Edmonton’s framers, since 1991
        </span>
      </header>
      <main>
        <div className="intro">
          <div>
            <div className="eyebrow">
              <span className="tiny-line" /> MADE PERSONAL. MADE TO KEEP.
            </div>
            <h1>
              Your moment.
              <br className="mobile-break" /> <em>Beautifully framed.</em>
            </h1>
          </div>
          <p>
            A photograph becomes something more.
            <br />
            Find the frame that makes it yours.
          </p>
        </div>
        <div className="workspace">
          <section
            className={`preview-stage ${mode === "room" ? "room-mode" : ""} ${expanded ? "is-expanded" : ""}`}
            style={{ "--wall-color": wallColors[wall] } as React.CSSProperties}
            aria-label="Live framed photograph preview"
          >
            <div className="stage-top">
              <span className="stage-label">
                <span /> YOUR LIVE PREVIEW
              </span>
              <div className="stage-top-actions">
                <button
                  onClick={() => {
                    setExploded(!exploded);
                    setMode("studio");
                  }}
                  className={exploded ? "active" : ""}
                  aria-label="Explore frame layers"
                  aria-pressed={exploded}
                >
                  <Layers3 size={18} />
                </button>
                <button
                  onClick={() => setShowDimensions(!showDimensions)}
                  className={showDimensions ? "active" : ""}
                  aria-label="Show frame dimensions"
                  aria-pressed={showDimensions}
                >
                  <Ruler size={18} />
                </button>
                <button
                  onClick={() => setExpanded(!expanded)}
                  aria-label={
                    expanded ? "Close full screen" : "Enlarge preview"
                  }
                >
                  {expanded ? <X size={18} /> : <Maximize2 size={17} />}
                </button>
              </div>
            </div>
            <div className="stage-ambient" aria-hidden="true" />
            <div className="room-floor" aria-hidden="true" />
            <div className="frame-canvas">
              <FramePreview
                configuration={config}
                mode={mode}
                exploded={exploded}
              />
            </div>
            <AnimatePresence>
              {showDimensions && (
                <motion.div
                  className="dimension-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="dimension-width">
                    {dim.outerWidth}″ overall
                  </span>
                  <span className="dimension-height">{dim.outerHeight}″</span>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div
                key={config.photoName}
                className="art-caption"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <span>
                  {exploded
                    ? "The art of putting it together."
                    : config.photoName}
                </span>
                <small>
                  {exploded
                    ? "Moulding. Mat. Photograph. A little magic."
                    : `${currentSize.label}″ print · ${currentFrame.name}`}
                </small>
              </motion.div>
            </AnimatePresence>
            <div className="stage-bottom">
              <div className="view-toggle" aria-label="Preview setting">
                {(["studio", "room"] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => {
                      setMode(view);
                      setExploded(false);
                    }}
                    aria-pressed={mode === view}
                  >
                    {mode === view && (
                      <motion.span
                        className="view-pill"
                        layoutId="view-pill"
                        transition={{
                          type: "spring",
                          bounce: 0.15,
                          duration: 0.4,
                        }}
                      />
                    )}
                    <span>
                      {view === "studio" ? "Studio view" : "On your wall"}
                    </span>
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait">
                {mode === "room" ? (
                  <motion.div
                    key="walls"
                    className="wall-swatches"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    aria-label="Wall colour"
                  >
                    {wallColors.map((color, i) => (
                      <button
                        key={color}
                        style={{ background: color }}
                        onClick={() => setWall(i)}
                        aria-label={
                          ["Chalk wall", "Sage wall", "Slate wall"][i]
                        }
                        aria-pressed={wall === i}
                      >
                        {wall === i && <Check size={13} />}
                      </button>
                    ))}
                  </motion.div>
                ) : (
                  <motion.span
                    key="hint"
                    className="interaction-hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <MoveUpRight size={15} />{" "}
                    {exploded
                      ? "Every layer has a purpose."
                      : "Move your cursor. Look a little closer."}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </section>
          <aside
            className="configuration-panel"
            aria-label="Customize your frame"
          >
            <div className="config-title">
              <span className="eyebrow">THE DETAILS MAKE IT YOURS</span>
              <button
                className="reset-button"
                onClick={() => {
                  update(defaultConfiguration);
                  setSection("frame");
                }}
                aria-label="Reset design"
              >
                <RotateCcw size={15} />
              </button>
            </div>
            <div className="steps">
              {(["photo", "size", "frame", "mat"] as Section[]).map(
                (id, index) => (
                  <section
                    className={`config-section ${section === id ? "is-open" : ""}`}
                    key={id}
                  >
                    <button
                      className="section-trigger"
                      onClick={() => setSection(id)}
                      aria-expanded={section === id}
                      aria-controls={`options-${id}`}
                    >
                      <span className="section-number">0{index + 1}</span>
                      <span className="section-heading">
                        {sectionLabels[id]}
                      </span>
                      <span className="section-summary">
                        {id === "photo"
                          ? "Selected"
                          : id === "size"
                            ? `${currentSize.label}″`
                            : id === "frame"
                              ? currentFrame.name
                              : currentMat.name}
                      </span>
                      <ChevronDown size={16} />
                    </button>
                    <AnimatePresence initial={false}>
                      {section === id && (
                        <motion.div
                          id={`options-${id}`}
                          className="section-content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: reduce ? 0 : 0.3,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          <div className="section-inner">
                            {id === "photo" && (
                              <>
                                <div className="photo-grid">
                                  {samples.map((sample) => (
                                    <button
                                      key={sample.id}
                                      className={`sample-photo ${config.photo === sample.src ? "selected" : ""}`}
                                      onClick={() =>
                                        update({
                                          photo: sample.src,
                                          photoName: sample.name,
                                        })
                                      }
                                      aria-label={`Use ${sample.name}`}
                                      aria-pressed={config.photo === sample.src}
                                    >
                                      <img src={sample.src} alt={sample.name} />
                                      {config.photo === sample.src && (
                                        <span>
                                          <Check size={13} />
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  className="upload-button"
                                  onClick={() => inputRef.current?.click()}
                                  disabled={uploading}
                                >
                                  {uploading ? (
                                    <LoaderCircle size={17} className="spin" />
                                  ) : (
                                    <Upload size={17} />
                                  )}{" "}
                                  {uploading
                                    ? "Preparing your photograph…"
                                    : "Or upload your own"}
                                </button>
                                <p className="option-note">
                                  JPG, PNG or WebP. Centre-cropped to your print
                                  size. Demo order links are public—choose a
                                  non-private image.
                                </p>
                              </>
                            )}
                            {id === "size" && (
                              <>
                                <div className="size-grid">
                                  {sizes.map((size) => (
                                    <button
                                      key={size.id}
                                      className={
                                        config.size === size.id
                                          ? "selected"
                                          : ""
                                      }
                                      onClick={() => update({ size: size.id })}
                                      aria-pressed={config.size === size.id}
                                    >
                                      <span
                                        className="size-outline"
                                        style={{
                                          width: 16 + size.width,
                                          height: 16 + size.height,
                                        }}
                                      />
                                      <span>{size.label}″</span>
                                    </button>
                                  ))}
                                </div>
                                <p className="option-note">
                                  Print dimensions in inches. Your frame and mat
                                  add a little room around the edges.
                                </p>
                              </>
                            )}
                            {id === "frame" && (
                              <>
                                <div className="frame-grid">
                                  {frames.map((frame) => (
                                    <button
                                      key={frame.id}
                                      className={`frame-choice ${config.frame === frame.id ? "selected" : ""}`}
                                      onClick={() =>
                                        update({ frame: frame.id })
                                      }
                                      aria-pressed={config.frame === frame.id}
                                    >
                                      <span
                                        className={`material-chip material-${frame.id}`}
                                      >
                                        {config.frame === frame.id && (
                                          <span>
                                            <Check size={12} />
                                          </span>
                                        )}
                                      </span>
                                      <span>{frame.name}</span>
                                    </button>
                                  ))}
                                </div>
                                <AnimatePresence mode="wait">
                                  <motion.p
                                    key={config.frame}
                                    className="material-description"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                  >
                                    {currentFrame.description}{" "}
                                    <span>¾″ profile.</span>
                                  </motion.p>
                                </AnimatePresence>
                              </>
                            )}
                            {id === "mat" && (
                              <>
                                <div className="mat-options">
                                  {mats.map((mat) => (
                                    <button
                                      key={mat.id}
                                      aria-label={mat.name}
                                      title={mat.name}
                                      className={
                                        config.mat === mat.id ? "selected" : ""
                                      }
                                      onClick={() => update({ mat: mat.id })}
                                      aria-pressed={config.mat === mat.id}
                                    >
                                      <span style={{ background: mat.color }}>
                                        {mat.id === "none" ? (
                                          "╱"
                                        ) : config.mat === mat.id ? (
                                          <Check
                                            size={16}
                                            color={
                                              mat.id === "charcoal"
                                                ? "white"
                                                : "#252b22"
                                            }
                                          />
                                        ) : null}
                                      </span>
                                    </button>
                                  ))}
                                  <span>{currentMat.name}</span>
                                </div>
                                {config.mat !== "none" && (
                                  <>
                                    <div className="mat-width">
                                      <span>Border width</span>
                                      <div>
                                        {([1.5, 2, 3] as const).map((width) => (
                                          <button
                                            key={width}
                                            className={
                                              config.matWidth === width
                                                ? "selected"
                                                : ""
                                            }
                                            onClick={() =>
                                              update({ matWidth: width })
                                            }
                                            aria-pressed={
                                              config.matWidth === width
                                            }
                                          >
                                            {width}″
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <button
                                      className="weighted-option"
                                      role="switch"
                                      aria-checked={config.bottomWeighted}
                                      onClick={() =>
                                        update({
                                          bottomWeighted:
                                            !config.bottomWeighted,
                                        })
                                      }
                                    >
                                      <span>
                                        <span>Bottom-weighted mat</span>
                                        <small>
                                          A little extra space below. A framer’s
                                          finishing touch.
                                        </small>
                                      </span>
                                      <span
                                        className={`switch ${config.bottomWeighted ? "on" : ""}`}
                                      >
                                        <span />
                                      </span>
                                    </button>
                                    <p className="option-note">
                                      Adds ½″ to the bottom border for visual
                                      balance.
                                    </p>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                ),
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
              className="visually-hidden"
              tabIndex={-1}
              aria-label="Upload photograph"
            />
            <div className="checkout-area">
              <div className="price-row">
                <div>
                  <span>Your one-of-a-kind frame</span>
                  <small>
                    Print, frame & {config.mat === "none" ? "glazing" : "mat"}{" "}
                    included
                  </small>
                </div>
                <div
                  className="price"
                  aria-live="polite"
                  aria-busy={quoteLoading}
                >
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={quote?.total ?? "loading"}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: quoteLoading ? 0.5 : 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                    >
                      {quote ? money(quote.total) : "—"}
                    </motion.span>
                  </AnimatePresence>
                  <small>CAD</small>
                </div>
              </div>
              <button
                className="checkout-button"
                disabled={busy || quoteLoading || !quote}
                onClick={() => void checkout()}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={20} /> Opening secure
                    checkout
                  </>
                ) : (
                  <>
                    Make it yours <ArrowRight size={20} />
                  </>
                )}
              </button>
              <button
                className="test-card"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText("4242424242424242");
                    setCardCopied(true);
                    setTimeout(() => setCardCopied(false), 2500);
                  } catch {
                    setError(
                      "Test card: 4242 4242 4242 4242. Use any future expiry and any three-digit CVC.",
                    );
                  }
                }}
              >
                <span>
                  {cardCopied
                    ? "Test card copied"
                    : "Try it with 4242 4242 4242 4242"}
                </span>
                {cardCopied ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <div className="secure-note">
                <ShieldCheck size={14} />
                <span>
                  Secure Stripe checkout <span>·</span> Test mode
                </span>
              </div>
              <AnimatePresence>
                {error && (
                  <motion.div
                    className="error-message"
                    role="alert"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <span>{error}</span>
                    <button
                      aria-label="Dismiss message"
                      onClick={() => setError("")}
                    >
                      <X size={16} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </aside>
        </div>
        <div className="studio-footer">
          <div>
            <span className="footer-star">✳</span>
            <p>
              Not just a frame.
              <br />
              <strong>A place for your favourite feeling.</strong>
            </p>
          </div>
          <div className="craft-notes">
            <span>
              <Check size={15} /> Real framing proportions
            </span>
            <span>
              <Check size={15} /> Made for your photograph
            </span>
            <span>
              <Check size={15} /> A preview from every angle
            </span>
          </div>
          <span className="studio-edition">
            THE STUDIO COLLECTION <span>—</span> 01
          </span>
        </div>
      </main>
      <footer className="legal-footer">
        <span>Expressions & Images · Independent concept demo by Davron</span>
        <span>No real purchases. Just possibilities.</span>
      </footer>
    </div>
  );
}
