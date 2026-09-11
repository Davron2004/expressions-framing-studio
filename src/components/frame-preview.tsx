"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Configuration } from "@/lib/catalog";
import { dimensions, frames, mats } from "@/lib/catalog";
import styles from "./frame-preview.module.css";

type Props = {
  configuration: Configuration;
  mode: "studio" | "room";
  className?: string;
  exploded?: boolean;
};

const frameTone = (id: Configuration["frame"]) =>
  frames.find((frame) => frame.id === id)?.color ?? "#b58b56";
const matTone = (id: Configuration["mat"]) =>
  mats.find((mat) => mat.id === id)?.color ?? "#f3f0e6";

class PreviewErrorBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function usePhotoTexture(source: string) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    setTexture(null);
    const loader = new THREE.TextureLoader();
    loader.load(
      source,
      (loaded) => {
        if (!live) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 4;
        loaded.minFilter = THREE.LinearFilter;
        setTexture(loaded);
      },
      undefined,
      () => setTexture(null),
    );
    return () => {
      live = false;
    };
  }, [source]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function WoodMaterial({
  color,
  kind,
}: {
  color: string;
  kind: Configuration["frame"];
}) {
  const material = useMemo(() => {
    const c = new THREE.Color(color);
    if (kind === "black" || kind === "white")
      return new THREE.MeshStandardMaterial({
        color: c,
        roughness: kind === "black" ? 0.38 : 0.5,
        metalness: 0,
      });
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    for (let i = 0; i < 32; i++) {
      const y = (i / 31) * canvas.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= canvas.width; x += 12)
        ctx.lineTo(x, y + Math.sin(x / 35 + i * 1.9) * (1.3 + (i % 4)));
      ctx.strokeStyle =
        kind === "walnut"
          ? `rgba(29, 12, 7, ${0.13 + (i % 3) * 0.045})`
          : `rgba(77, 45, 19, ${0.11 + (i % 3) * 0.04})`;
      ctx.lineWidth = i % 6 === 0 ? 1.6 : 0.55;
      ctx.stroke();
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1.8, 1);
    const result = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map,
      roughness: 0.46,
      metalness: 0,
    });
    return result;
  }, [color, kind]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );
  return <primitive attach="material" object={material} />;
}

function Rail({
  rotation,
  length,
  width,
  x,
  y,
  color,
  kind,
}: {
  rotation: number;
  length: number;
  width: number;
  x: number;
  y: number;
  color: string;
  kind: Configuration["frame"];
}) {
  const geometry = useMemo(() => {
    const half = length / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, width / 2);
    shape.lineTo(-half + width, -width / 2);
    shape.lineTo(half - width, -width / 2);
    shape.lineTo(half, width / 2);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.27,
      bevelEnabled: true,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      bevelSegments: 1,
    });
  }, [length, width]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[x, y, -0.01]} rotation={[0, 0, rotation]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <WoodMaterial color={color} kind={kind} />
      </mesh>
    </group>
  );
}

function MatBoard({
  width,
  height,
  openingWidth,
  openingHeight,
  openingY,
  color,
}: {
  width: number;
  height: number;
  openingWidth: number;
  openingHeight: number;
  openingY: number;
  color: string;
}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -height / 2);
    shape.lineTo(width / 2, -height / 2);
    shape.lineTo(width / 2, height / 2);
    shape.lineTo(-width / 2, height / 2);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-openingWidth / 2, openingY - openingHeight / 2);
    hole.lineTo(openingWidth / 2, openingY - openingHeight / 2);
    hole.lineTo(openingWidth / 2, openingY + openingHeight / 2);
    hole.lineTo(-openingWidth / 2, openingY + openingHeight / 2);
    hole.closePath();
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 1,
    });
  }, [width, height, openingWidth, openingHeight, openingY]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  );
}

const ROOM_SCALE = 0.82;

function FramedObject({
  configuration,
  mode,
  exploded = false,
  onReady,
}: {
  configuration: Configuration;
  mode: Props["mode"];
  exploded?: boolean;
  onReady: () => void;
}) {
  const texture = usePhotoTexture(configuration.photo);
  const group = useRef<THREE.Group>(null);
  const railsGroup = useRef<THREE.Group>(null);
  const matGroup = useRef<THREE.Group>(null);
  const photoGroup = useRef<THREE.Group>(null);
  const glassGroup = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const lastRatio = useRef<number | null>(null);
  const transitionY = useRef(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const d = dimensions(configuration);
  const unit = 5.15 / d.outerWidth;
  const outerW = d.outerWidth * unit;
  const outerH = d.outerHeight * unit;
  const rail = 0.75 * unit;
  const innerW = (d.printWidth + 2 * d.mat) * unit;
  const innerH = (d.printHeight + d.mat + d.bottom) * unit;
  const printW = d.printWidth * unit;
  const printH = d.printHeight * unit;
  const photoY =
    configuration.mat === "none" ? 0 : ((d.bottom - d.mat) * unit) / 2;
  const crop = useMemo(() => {
    if (!texture?.image)
      return {
        repeat: [1, 1] as [number, number],
        offset: [0, 0] as [number, number],
      };
    const image = texture.image as { width: number; height: number };
    const sourceRatio = image.width / image.height;
    const targetRatio = printW / printH;
    if (sourceRatio > targetRatio) {
      const r = targetRatio / sourceRatio;
      return {
        repeat: [r, 1] as [number, number],
        offset: [(1 - r) / 2, 0] as [number, number],
      };
    }
    const r = sourceRatio / targetRatio;
    return {
      repeat: [1, r] as [number, number],
      offset: [0, (1 - r) / 2] as [number, number],
    };
  }, [texture, printW, printH]);
  useEffect(() => {
    if (texture) {
      texture.repeat.set(...crop.repeat);
      texture.offset.set(...crop.offset);
      texture.needsUpdate = true;
      onReady();
    }
  }, [texture, crop, onReady]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const ratio = outerH / outerW;
    if (lastRatio.current !== null)
      transitionY.current *= lastRatio.current / ratio;
    lastRatio.current = ratio;
  }, [outerH, outerW]);
  useEffect(() => {
    const update = (e: PointerEvent) => {
      pointer.current = {
        x: e.clientX / window.innerWidth - 0.5,
        y: e.clientY / window.innerHeight - 0.5,
      };
    };
    window.addEventListener("pointermove", update, { passive: true });
    return () => window.removeEventListener("pointermove", update);
  }, []);
  useFrame((_, delta) => {
    if (!group.current) return;
    const targetX = exploded
      ? 0.1
      : reducedMotion || mode === "room"
        ? 0.018
        : pointer.current.y * 0.1;
    const targetY = exploded
      ? -0.55
      : reducedMotion || mode === "room"
        ? -0.02
        : pointer.current.x * 0.13;
    group.current.rotation.x = THREE.MathUtils.damp(
      group.current.rotation.x,
      targetX,
      5,
      delta,
    );
    group.current.rotation.y = THREE.MathUtils.damp(
      group.current.rotation.y,
      targetY,
      5,
      delta,
    );
    transitionY.current = THREE.MathUtils.damp(
      transitionY.current,
      1,
      6,
      delta,
    );
    const targetScale = mode === "room" ? ROOM_SCALE : 1;
    group.current.scale.x = THREE.MathUtils.damp(
      group.current.scale.x,
      targetScale,
      6,
      delta,
    );
    group.current.scale.z = group.current.scale.x;
    group.current.scale.y = THREE.MathUtils.damp(
      group.current.scale.y,
      targetScale * transitionY.current,
      6,
      delta,
    );
    const dampLayer = (layer: THREE.Group | null, target: number) => {
      if (!layer) return;
      layer.position.z = reducedMotion
        ? target
        : THREE.MathUtils.damp(layer.position.z, target, 6, delta);
    };
    if (railsGroup.current) {
      dampLayer(railsGroup.current, exploded ? 1.4 : 0);
    }
    dampLayer(matGroup.current, exploded ? 0.3 : 0);
    dampLayer(photoGroup.current, exploded ? -0.4 : 0);
    dampLayer(glassGroup.current, exploded ? 0.8 : 0);
  });
  const matColor = matTone(configuration.mat);
  return (
    <group ref={group}>
      <group ref={railsGroup}>
        <Rail
          rotation={0}
          length={outerW}
          width={rail}
          x={0}
          y={outerH / 2 - rail / 2}
          color={frameTone(configuration.frame)}
          kind={configuration.frame}
        />
        <Rail
          rotation={Math.PI}
          length={outerW}
          width={rail}
          x={0}
          y={-outerH / 2 + rail / 2}
          color={frameTone(configuration.frame)}
          kind={configuration.frame}
        />
        <Rail
          rotation={Math.PI / 2}
          length={outerH}
          width={rail}
          x={-outerW / 2 + rail / 2}
          y={0}
          color={frameTone(configuration.frame)}
          kind={configuration.frame}
        />
        <Rail
          rotation={-Math.PI / 2}
          length={outerH}
          width={rail}
          x={outerW / 2 - rail / 2}
          y={0}
          color={frameTone(configuration.frame)}
          kind={configuration.frame}
        />
      </group>
      {configuration.mat !== "none" && (
        <group ref={matGroup} position={[0, 0, 0.075]}>
          <MatBoard
            width={innerW}
            height={innerH}
            openingWidth={printW}
            openingHeight={printH}
            openingY={photoY}
            color={matColor}
          />
        </group>
      )}
      <group ref={photoGroup} position={[0, 0, 0.065]}>
        <mesh position={[0, photoY, 0]}>
          <planeGeometry args={[printW + 0.04, printH + 0.04]} />
          <meshBasicMaterial color="#1d1813" transparent opacity={0.17} />
        </mesh>
        <mesh position={[0, photoY, 0.006]}>
          <planeGeometry args={[printW, printH]} />
          {texture ? (
            <meshBasicMaterial
              key={texture.uuid}
              map={texture}
              color="#ffffff"
              toneMapped={false}
            />
          ) : (
            <meshBasicMaterial key="placeholder" color="#807566" />
          )}
        </mesh>
      </group>
      <group ref={glassGroup} position={[0, 0, 0.18]}>
        <mesh>
          <planeGeometry args={[innerW, innerH]} />
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.045}
            roughness={0.12}
            metalness={0}
            clearcoat={1}
          />
        </mesh>
      </group>
    </group>
  );
}

function CameraFit({
  configuration,
  mode,
}: {
  configuration: Configuration;
  mode: Props["mode"];
}) {
  const { size, camera, gl } = useThree();
  const d = dimensions(configuration);
  const unit = 5.15 / d.outerWidth;
  const outerW = d.outerWidth * unit;
  const outerH = d.outerHeight * unit;
  useLayoutEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    ortho.zoom = Math.min(
      size.width / (outerW + 1.6),
      size.height / (outerH + 2.1),
    );
    ortho.updateProjectionMatrix();

    // The caption under the frame is HTML, not part of the scene, so it needs to know where
    // the frame's bottom edge actually lands. That edge moves with print size, wall-view
    // scale and stage size; a fixed CSS offset overlapped tall prints in wall view.
    const stage = gl.domElement.closest<HTMLElement>(".preview-stage");
    if (!stage) return;
    const scale = mode === "room" ? ROOM_SCALE : 1;
    const canvasTop =
      gl.domElement.getBoundingClientRect().top -
      stage.getBoundingClientRect().top;
    const frameBottom =
      canvasTop + size.height / 2 + (outerH / 2) * scale * ortho.zoom;
    stage.style.setProperty("--frame-bottom", `${Math.round(frameBottom)}px`);
    stage.classList.add("has-frame-metrics");
  }, [camera, gl, size.width, size.height, outerW, outerH, mode]);
  return null;
}

function Scene({
  configuration,
  mode,
  exploded,
  onReady,
}: {
  configuration: Configuration;
  mode: Props["mode"];
  exploded?: boolean;
  onReady: () => void;
}) {
  return (
    <>
      <CameraFit configuration={configuration} mode={mode} />
      <ambientLight intensity={1.7} color="#ffffff" />
      <directionalLight
        position={[-3.5, 5, 5]}
        intensity={2}
        color="#fff3df"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={0.025}
      />
      <pointLight position={[4, -1, 3]} intensity={1.2} color="#e8efff" />
      <FramedObject
        configuration={configuration}
        mode={mode}
        exploded={exploded}
        onReady={onReady}
      />
      <ContactShadows
        position={[0, -3.1, -1]}
        opacity={0.3}
        scale={8}
        blur={2.8}
        far={4}
        color="#4a3528"
      />
    </>
  );
}

function Fallback({ configuration }: { configuration: Configuration }) {
  const d = dimensions(configuration);
  const frame = frameTone(configuration.frame);
  const mat = matTone(configuration.mat);
  const matWidth = configuration.mat === "none" ? 0 : Math.max(10, d.mat * 13);
  const bottom =
    configuration.mat === "none"
      ? 0
      : matWidth +
        (configuration.bottomWeighted
          ? Math.round((matWidth / Math.max(d.mat, 1)) * 0.5)
          : 0);
  return (
    <div
      className={styles.fallback}
      aria-hidden="true"
      style={{
        borderColor: frame,
        background: mat,
        aspectRatio: `${d.outerWidth} / ${d.outerHeight}`,
        padding: `${matWidth}px ${matWidth}px ${bottom}px`,
      }}
    >
      <img src={configuration.photo} alt="" />
    </div>
  );
}

export default function FramePreview({
  configuration,
  mode,
  className,
  exploded = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const label = `${frames.find((f) => f.id === configuration.frame)?.name ?? "Custom"} frame, ${configuration.mat === "none" ? "no mat" : `${configuration.matWidth} inch ${mats.find((m) => m.id === configuration.mat)?.name} mat`}${configuration.bottomWeighted && configuration.mat !== "none" ? ", bottom weighted" : ""}`;
  return (
    <div
      className={`${styles.preview} ${className ?? ""}`}
      role="img"
      aria-label={label}
    >
      {(!ready || failed) && <Fallback configuration={configuration} />}
      {mounted && !failed && (
        <PreviewErrorBoundary onError={() => setFailed(true)}>
          <Canvas
            className={`${styles.canvas} ${ready ? styles.ready : ""}`}
            dpr={[1, 1.5]}
            shadows
            gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
            orthographic
            camera={{ position: [0, 0, 10], zoom: 60 }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
            }}
          >
            <Scene
              configuration={configuration}
              mode={mode}
              exploded={exploded}
              onReady={() => setReady(true)}
            />
          </Canvas>
        </PreviewErrorBoundary>
      )}
    </div>
  );
}
