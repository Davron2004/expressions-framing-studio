"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  Frame,
  LoaderCircle,
  RefreshCw,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dimensions,
  frames,
  mats,
  money,
  sizes,
  type Configuration,
} from "@/lib/catalog";
import styles from "./order-views.module.css";

type OrderStatus = "pending" | "paid" | "expired";
type PublicOrder = {
  id: string;
  status: OrderStatus;
  configuration: Configuration;
  total: number;
  currency: string;
  createdAt: string;
  paidAt?: string | null;
};
type LoadState<T> = { data: T | null; loading: boolean; error: string | null };

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
const shortId = (id: string) =>
  id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
const frameFor = (configuration: Configuration) =>
  frames.find((item) => item.id === configuration.frame);
const matFor = (configuration: Configuration) =>
  mats.find((item) => item.id === configuration.mat);
const sizeFor = (configuration: Configuration) =>
  sizes.find((item) => item.id === configuration.size);

function Header() {
  return (
    <header className={styles.header}>
      <Link
        href="/"
        className={styles.mark}
        aria-label="Expressions & Images home"
      >
        E<span>&amp;</span>I
      </Link>
      <nav>
        <Link href="/">Frame studio</Link>
        <Link href="/orders">Orders</Link>
      </nav>
    </header>
  );
}

function FramedImage({
  configuration,
  className,
}: {
  configuration: Configuration;
  className?: string;
}) {
  const frame = frameFor(configuration);
  const mat = matFor(configuration);
  const measure = dimensions(configuration);
  const outerWidth = measure.outerWidth;
  const frameWidth = (0.75 / outerWidth) * 100;
  const matX = (measure.mat / outerWidth) * 100;
  const matY = (measure.mat / outerWidth) * 100;
  const matBottom = (measure.bottom / outerWidth) * 100;
  return (
    <div
      className={`${styles.frameObject} ${className ?? ""}`}
      style={
        {
          "--frame-colour": frame?.color ?? "#242522",
          "--mat-colour": mat?.color ?? "#f3f0e6",
          "--outer-ratio": `${measure.outerWidth} / ${measure.outerHeight}`,
          "--image-ratio": `${measure.printWidth} / ${measure.printHeight}`,
          "--frame-space": `${frameWidth}%`,
          "--mat-x": `${matX}%`,
          "--mat-y": `${matY}%`,
          "--mat-bottom": `${matBottom}%`,
        } as React.CSSProperties
      }
    >
      <div className={styles.frameMat}>
        {configuration.photo ? (
          <img src={configuration.photo} alt="Your selected artwork" />
        ) : (
          <div className={styles.uploadPlaceholder}>
            <Frame size={23} />
            <span>Photo</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Status({ status }: { status: OrderStatus }) {
  const label =
    status === "paid"
      ? "Paid"
      : status === "expired"
        ? "Payment expired"
        : "Awaiting confirmation";
  return (
    <span className={`${styles.status} ${styles[status]}`}>
      <i />
      {label}
    </span>
  );
}

function Summary({
  order,
  receipt = false,
}: {
  order: PublicOrder;
  receipt?: boolean;
}) {
  const size = sizeFor(order.configuration);
  const frame = frameFor(order.configuration);
  const mat = matFor(order.configuration);
  const bottomWeight =
    order.configuration.mat !== "none" && order.configuration.bottomWeighted;
  return (
    <div className={receipt ? styles.receiptSummary : styles.orderDetails}>
      <div>
        <span>Edition</span>
        <strong>{order.configuration.photoName}</strong>
      </div>
      <div>
        <span>Format</span>
        <strong>
          {size?.label} · {frame?.name}
        </strong>
      </div>
      <div>
        <span>Mat</span>
        <strong>
          {mat?.name}
          {order.configuration.mat === "none"
            ? ""
            : ` · ${order.configuration.matWidth}″${bottomWeight ? " + 0.5″ bottom weight" : ""}`}
        </strong>
      </div>
      <div>
        <span>Total</span>
        <strong>{money(order.total)}</strong>
      </div>
    </div>
  );
}

export function OrdersView() {
  const [state, setState] = useState<LoadState<PublicOrder[]>>({
    data: null,
    loading: true,
    error: null,
  });
  const [configured, setConfigured] = useState(true);
  const fetchOrders = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.error || "We could not retrieve your orders.");
      setConfigured(body.configured !== false);
      setState({ data: body.orders ?? [], loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "We could not retrieve your orders.",
      });
    }
  }, []);
  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);
  return (
    <main className={styles.shell}>
      <Header />
      <section className={styles.ordersIntro}>
        <p className={styles.eyebrow}>Collected pieces</p>
        <div className={styles.titleLine}>
          <h1>Your orders</h1>
          <button
            className={styles.refresh}
            onClick={() => void fetchOrders()}
            disabled={state.loading}
          >
            <RefreshCw
              size={15}
              className={state.loading ? styles.spinning : ""}
            />{" "}
            Refresh
          </button>
        </div>
        <p>
          Every frame is made around the image you chose, for the place you keep
          it.
        </p>
      </section>
      {state.loading && !state.data ? (
        <div className={styles.loading}>
          <LoaderCircle className={styles.spinning} size={22} /> Finding your
          pieces
        </div>
      ) : state.error ? (
        <section className={styles.problem}>
          <CircleAlert size={22} />
          <div>
            <h2>Orders are temporarily unavailable</h2>
            <p>{state.error}</p>
            <button onClick={() => void fetchOrders()}>
              Try again <ArrowRight size={15} />
            </button>
          </div>
        </section>
      ) : !configured ? (
        <section className={styles.empty}>
          <div className={styles.emptyMark}>
            <CircleAlert size={26} />
          </div>
          <p className={styles.eyebrow}>Ordering unavailable</p>
          <h2>This studio isn’t configured for orders yet.</h2>
          <p>
            Framing is still available to explore. Please return when ordering
            is enabled.
          </p>
          <Link href="/" className={styles.limeButton}>
            Visit frame studio <ArrowRight size={16} />
          </Link>
        </section>
      ) : state.data?.length ? (
        <section className={styles.orderList}>
          {state.data.map((order) => (
            <Link
              className={styles.orderRow}
              href={`/order/${encodeURIComponent(order.id)}`}
              key={order.id}
            >
              <FramedImage
                configuration={order.configuration}
                className={styles.rowArt}
              />
              <div className={styles.orderMeta}>
                <div className={styles.rowTop}>
                  <Status status={order.status} />
                  <span>{formatDate(order.createdAt)}</span>
                </div>
                <h2>{order.configuration.photoName}</h2>
                <p>
                  {sizeFor(order.configuration)?.label} ·{" "}
                  {frameFor(order.configuration)?.name} ·{" "}
                  {matFor(order.configuration)?.name}
                </p>
                <small>Order {shortId(order.id)}</small>
              </div>
              <strong className={styles.rowPrice}>
                {money(order.total)}
                <ArrowRight size={17} />
              </strong>
            </Link>
          ))}
        </section>
      ) : (
        <section className={styles.empty}>
          <div className={styles.emptyMark}>
            <Frame size={26} />
          </div>
          <p className={styles.eyebrow}>Your wall is waiting</p>
          <h2>No framed moments yet.</h2>
          <p>
            Choose an image, settle on a frame, and make something worth coming
            back to.
          </p>
          <Link href="/" className={styles.limeButton}>
            Start framing <ArrowRight size={16} />
          </Link>
        </section>
      )}
      <p className={styles.demoNote}>Demo order · no real charge</p>
    </main>
  );
}

export function OrderDetailView({ orderId }: { orderId: string }) {
  const [state, setState] = useState<LoadState<PublicOrder>>({
    data: null,
    loading: true,
    error: null,
  });
  const [timedOut, setTimedOut] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const attempt = useRef(0);
  const reduced = useReducedMotion();
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(orderId)}`,
          { cache: "no-store", signal },
        );
        const body = await response.json().catch(() => null);
        if (response.status === 404) throw new Error("not-found");
        if (!response.ok)
          throw new Error(
            body?.error || "We could not find this order right now.",
          );
        if (!signal?.aborted)
          setState({ data: body.order, loading: false, error: null });
        return body.order as PublicOrder;
      } catch (error) {
        if (signal?.aborted) return null;
        setState({
          data: null,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "We could not find this order right now.",
        });
        return null;
      }
    },
    [orderId],
  );
  const restartPolling = () => {
    attempt.current = 0;
    setTimedOut(false);
    setState((current) => ({ ...current, loading: true, error: null }));
    setPollKey((key) => key + 1);
  };
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async () => {
      const order = await load(controller.signal);
      if (!alive || !order || order.status !== "pending") return;
      attempt.current += 1;
      if (attempt.current >= 45) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [load, pollKey]);
  const order = state.data;
  return (
    <main className={styles.shell}>
      <Header />
      {state.loading && !order ? (
        <div className={styles.loading}>
          <LoaderCircle className={styles.spinning} size={22} /> Locating your
          order
        </div>
      ) : state.error === "not-found" ? (
        <section className={styles.problem}>
          <CircleAlert size={22} />
          <div>
            <h1>That order isn’t here.</h1>
            <p>It may have expired, or the link may be incomplete.</p>
            <Link href="/orders">
              View all orders <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      ) : state.error ? (
        <section className={styles.problem}>
          <CircleAlert size={22} />
          <div>
            <h1>We can’t reach this order.</h1>
            <p>{state.error}</p>
            <button onClick={restartPolling}>
              Try again <RefreshCw size={15} />
            </button>
          </div>
        </section>
      ) : (
        order && (
          <AnimatePresence mode="wait">
            {order.status === "paid" ? (
              <Paid order={order} reduced={!!reduced} />
            ) : order.status === "expired" ? (
              <Expired order={order} />
            ) : (
              <Pending
                order={order}
                timedOut={timedOut}
                onRefresh={restartPolling}
              />
            )}
          </AnimatePresence>
        )
      )}
      <p className={styles.demoNote}>Demo order · no real charge</p>
    </main>
  );
}

function Pending({
  order,
  timedOut,
  onRefresh,
}: {
  order: PublicOrder;
  timedOut: boolean;
  onRefresh: () => void;
}) {
  return (
    <motion.section
      className={styles.pendingView}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className={styles.pendingIcon}>
        <Clock3 size={28} />
      </div>
      <p className={styles.eyebrow}>Order received</p>
      <h1>Confirming your payment</h1>
      <p className={styles.lead}>
        {timedOut
          ? "This is taking a little longer. Refresh the payment status or check back in your orders."
          : "We’re waiting for payment confirmation. This page will update as soon as it arrives."}
      </p>
      {timedOut ? (
        <button className={styles.limeButton} onClick={onRefresh}>
          Refresh payment status <RefreshCw size={16} />
        </button>
      ) : (
        <div className={styles.pendingLine}>
          <span />
          <span />
          <span />
        </div>
      )}
      <div className={styles.detailLayout}>
        <FramedImage
          configuration={order.configuration}
          className={styles.detailArt}
        />
        <div>
          <Status status="pending" />
          <h2>{order.configuration.photoName}</h2>
          <p>
            Order {shortId(order.id)} · placed {formatDate(order.createdAt)}
          </p>
          <Summary order={order} />
        </div>
      </div>
      <Link href="/orders" className={styles.textLink}>
        View all orders <ArrowRight size={16} />
      </Link>
    </motion.section>
  );
}
function Expired({ order }: { order: PublicOrder }) {
  return (
    <motion.section
      className={styles.pendingView}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className={styles.pendingIcon}>
        <CircleAlert size={28} />
      </div>
      <p className={styles.eyebrow}>Payment window closed</p>
      <h1>This order has expired.</h1>
      <p className={styles.lead}>
        No payment was confirmed for this selection. You can return to the
        studio whenever you’re ready.
      </p>
      <Link href="/" className={styles.limeButton}>
        Frame another <ArrowRight size={16} />
      </Link>
      <div className={styles.detailLayout}>
        <FramedImage
          configuration={order.configuration}
          className={styles.detailArt}
        />
        <Summary order={order} />
      </div>
    </motion.section>
  );
}
function Paid({ order, reduced }: { order: PublicOrder; reduced: boolean }) {
  return (
    <motion.section
      className={styles.paidView}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {!reduced && (
        <div className={styles.confetti} aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ "--i": i } as React.CSSProperties} />
          ))}
        </div>
      )}
      <motion.div
        className={styles.seal}
        initial={reduced ? false : { scale: 0.55, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 170, damping: 13 }}
      >
        <Check size={32} />
      </motion.div>
      <p className={styles.eyebrow}>Payment confirmed</p>
      <h1>A moment, made to last.</h1>
      <p className={styles.lead}>
        Your test payment is complete. Here’s the piece you created.
      </p>
      <div className={styles.paidLayout}>
        <FramedImage
          configuration={order.configuration}
          className={styles.heroArt}
        />
        <aside className={styles.receipt}>
          <div className={styles.receiptHead}>
            <div>
              <ReceiptText size={18} />
              <span>Order receipt</span>
            </div>
            <Status status="paid" />
          </div>
          <h2>{order.configuration.photoName}</h2>
          <p>
            Order {shortId(order.id)}
            {order.paidAt ? ` · confirmed ${formatDate(order.paidAt)}` : ""}
          </p>
          <Summary order={order} receipt />
          <div className={styles.receiptActions}>
            <Link href="/orders">
              View orders <ArrowRight size={16} />
            </Link>
            <Link href="/" className={styles.limeButton}>
              Frame another <Sparkles size={15} />
            </Link>
          </div>
        </aside>
      </div>
    </motion.section>
  );
}
