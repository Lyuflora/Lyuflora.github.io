import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  Box,
  Expand,
  RotateCcw,
  Move,
  MousePointer2,
  Eye,
  EyeOff,
  Move3D,
  Scaling,
  Magnet,
  Check,
} from "lucide-react";
import { axes, position, velocity, type Motion, type Vec3 } from "./motion";
import { NumberField, colors, type Sample } from "./Graph";
type SceneState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  path: THREE.Group;
  marker: THREE.Group;
  renderer: THREE.WebGLRenderer;
  bounds: THREE.Box3;
  obstacle: THREE.Group;
  transform: TransformControls;
  obstacleFill: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  fit: () => void;
};
function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    if (
      o instanceof THREE.Mesh ||
      o instanceof THREE.Line ||
      o instanceof THREE.Sprite
    ) {
      if ("geometry" in o) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if ("map" in m) (m.map as THREE.Texture | null)?.dispose();
        m.dispose();
      });
    }
  });
  group.clear();
}
export function Viewport({
  motion,
  samples,
  time,
  onObstacle,
  onObstacleChange,
  editing,
  onEditingChange: setEditing,
  editorContainer,
}: {
  motion: Motion;
  samples: Sample[];
  time: number;
  onObstacle: () => void;
  onObstacleChange: (obstacle: Motion["obstacle"]) => void;
  editing: boolean;
  onEditingChange: (active: boolean) => void;
  editorContainer: HTMLElement | null;
}) {
  const host = useRef<HTMLDivElement>(null),
    state = useRef<SceneState | null>(null),
    [error, setError] = useState(""),
    [pan, setPan] = useState(false),
    [tool, setTool] = useState<"translate" | "scale">("translate"),
    [snap, setSnap] = useState(false);
  const motionRef = useRef(motion),
    changeRef = useRef(onObstacleChange);
  motionRef.current = motion;
  changeRef.current = onObstacleChange;
  const factor = motion.units === "cm" ? 100 : 1;
  const property = tool === "translate" ? "position" : "size";
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(
        "WebGL is unavailable. Enable hardware acceleration to view the 3D trajectory.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x101720, 1);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x101720, 0.018);
    const camera = new THREE.PerspectiveCamera(
      40,
      el.clientWidth / el.clientHeight,
      0.01,
      2000,
    );
    camera.position.set(12, 10, 15);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(4, 1, -1);
    controls.minDistance = 0.3;
    controls.maxDistance = 700;
    const obstacle = new THREE.Group();
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const obstacleFill = new THREE.Mesh(
      cube,
      new THREE.MeshBasicMaterial({
        color: 0xeaac57,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
    );
    const obstacleEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cube),
      new THREE.LineDashedMaterial({
        color: 0xe1aa61,
        dashSize: 0.08,
        gapSize: 0.04,
        transparent: true,
        opacity: 0.8,
      }),
    );
    obstacleEdges.computeLineDistances();
    obstacle.add(obstacleFill, obstacleEdges);
    scene.add(obstacle);
    // Connect the object gizmo first so it can disable orbit before a handle drag.
    controls.disconnect();
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setColors(0x28e1ed, 0xffc654, 0xc47bff, 0xffffff);
    transform.setSize(0.85);
    scene.add(transform.getHelper());
    transform.addEventListener("dragging-changed", (e) => {
      controls.enabled = !e.value;
      if (e.value) controls.update();
    });
    transform.addEventListener("objectChange", () => {
      obstacle.scale.set(
        Math.max(0.01, obstacle.scale.x),
        Math.max(0.01, obstacle.scale.y),
        Math.max(0.01, obstacle.scale.z),
      );
      changeRef.current({
        ...motionRef.current.obstacle,
        position: obstacle.position.toArray() as Vec3,
        size: obstacle.scale.toArray() as Vec3,
      });
    });
    controls.connect(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    const raycaster = new THREE.Raycaster();
    let pointerStart: { x: number; y: number; transforming: boolean } | null =
      null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      renderer.domElement.focus({ preventScroll: true });
      pointerStart = {
        x: e.clientX,
        y: e.clientY,
        transforming: transform.dragging,
      };
    };
    const onPointerUp = (e: PointerEvent) => {
      const start = pointerStart;
      pointerStart = null;
      if (
        !start ||
        start.transforming ||
        Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4 ||
        !obstacle.visible
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      if (raycaster.intersectObject(obstacleFill).length) setEditing(true);
      else if (!transform.axis) setEditing(false);
    };
    const onPointerCancel = () => {
      pointerStart = null;
      if (transform.dragging) {
        transform.reset();
        transform.pointerUp(null);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    const grid = new THREE.GridHelper(100, 50, 0x354657, 0x253442);
    grid.position.y = -0.02;
    scene.add(grid);
    const path = new THREE.Group(),
      marker = new THREE.Group();
    scene.add(path, marker);
    marker.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.105, 20, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      ),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 20, 16),
      new THREE.MeshBasicMaterial({
        color: 0x24e3ef,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
    );
    marker.add(halo);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.48, 4),
      new THREE.MeshBasicMaterial({ color: 0x24e3ef, wireframe: true }),
    );
    arrow.position.y = 0.28;
    marker.add(arrow);
    const bounds = new THREE.Box3();
    const fit = () => {
      const box = bounds.clone();
      if (obstacle.visible) box.union(new THREE.Box3().setFromObject(obstacle));
      if (box.isEmpty())
        box.setFromCenterAndSize(
          new THREE.Vector3(),
          new THREE.Vector3(5, 5, 5),
        );
      const center = box.getCenter(new THREE.Vector3());
      const direction = new THREE.Vector3(0.55, 0.45, 0.95).normalize();
      const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
      const up = direction.clone().cross(right).normalize();
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const tanH = tanV * camera.aspect;
      let d = 4;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const offset = new THREE.Vector3(x, y, z).sub(center);
            d = Math.max(
              d,
              offset.dot(direction) +
                Math.max(
                  Math.abs(offset.dot(right)) / tanH,
                  Math.abs(offset.dot(up)) / tanV,
                ),
            );
          }
        }
      }
      d *= 1.2;
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(direction, d);
      camera.near = Math.max(0.01, d / 1000);
      camera.far = Math.max(200, d * 20);
      camera.updateProjectionMatrix();
      controls.update();
    };
    obstacle.position.set(...motionRef.current.obstacle.position);
    obstacle.scale.set(...motionRef.current.obstacle.size);
    obstacle.visible = motionRef.current.obstacle.visible;
    const s = {
      scene,
      camera,
      controls,
      path,
      marker,
      renderer,
      bounds,
      obstacle,
      obstacleFill,
      transform,
      fit,
    };
    state.current = s;
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    let raf = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      transform.dispose();
      disposeGroup(obstacle);
      disposeGroup(path);
      disposeGroup(marker);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);
  const first = useRef(true);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    disposeGroup(s.path);
    const points = samples.map((p) => new THREE.Vector3(...p.position)),
      box = new THREE.Box3().setFromPoints(points),
      span = Math.max(box.getSize(new THREE.Vector3()).length(), 1),
      radius = span * 0.003;
    s.bounds.copy(box);
    if (points.some((p) => p.distanceTo(points[0]) > 0.00001)) {
      // Linear CurvePath preserves sampled trajectory segments without overshoot.
      const poly = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < points.length; i++)
        if (points[i].distanceTo(points[i - 1]) > 1e-9)
          poly.add(new THREE.LineCurve3(points[i - 1], points[i]));
      const geom = new THREE.TubeGeometry(poly, 600, radius, 6, false);
      s.path.add(
        new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0x28e1ed })),
      );
      const glow = new THREE.TubeGeometry(poly, 600, radius * 3, 6, false);
      s.path.add(
        new THREE.Mesh(
          glow,
          new THREE.MeshBasicMaterial({
            color: 0x28e1ed,
            transparent: true,
            opacity: 0.075,
            depthWrite: false,
          }),
        ),
      );
    }
    const keyTimes = new Set([
      0,
      motion.lifetime,
      ...Object.values(motion.curves).flatMap((keys) =>
        keys.map((k) => k.time),
      ),
    ]);
    samples.forEach((sample, i) => {
      if (!keyTimes.has(sample.time)) return;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(
          radius * (i === 0 || i === points.length - 1 ? 3.1 : 2),
          12,
          10,
        ),
        new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffffff : 0xa5faff }),
      );
      dot.position.copy(points[i]);
      s.path.add(dot);
    });
    const axisLength = Math.max(span * 0.35, 2);
    [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ].forEach((dir, i) => {
      s.path.add(
        new THREE.ArrowHelper(
          dir,
          new THREE.Vector3(),
          axisLength,
          [0x28e1ed, 0xffc654, 0xc47bff][i],
          0.22,
          0.1,
        ),
      );
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = ["#28e1ed", "#ffc654", "#c47bff"][i];
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(["X", "Y", "Z"][i], 32, 45);
      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthTest: false }),
      );
      sprite.position.copy(dir.clone().multiplyScalar(axisLength + 0.35));
      sprite.scale.setScalar(0.45);
      s.path.add(sprite);
    });
    if (first.current) {
      s.fit();
      first.current = false;
    }
  }, [samples]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const o = motion.obstacle;
    s.obstacle.visible = o.visible;
    if (!s.transform.dragging) {
      s.obstacle.position.set(...o.position);
      s.obstacle.scale.set(...o.size);
    }
    s.obstacleFill.material.opacity = editing ? 0.18 : 0.07;
    if (editing && o.visible) {
      if (s.transform.object !== s.obstacle) s.transform.attach(s.obstacle);
      if (s.transform.mode !== tool) s.transform.setMode(tool);
      s.transform.setTranslationSnap(snap ? 0.1 : null);
      s.transform.setScaleSnap(snap ? 0.1 : null);
    } else {
      s.transform.detach();
      s.controls.enabled = true;
    }
    if (!o.visible) setEditing(false);
  }, [motion.obstacle, editing, tool, snap]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.marker.position.set(...position(motion, time));
    const v = new THREE.Vector3(...velocity(motion, time));
    if (v.lengthSq() > 1e-10)
      s.marker.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        v.normalize(),
      );
  }, [motion, time]);
  useEffect(() => {
    if (state.current)
      state.current.controls.mouseButtons.LEFT = pan
        ? THREE.MOUSE.PAN
        : THREE.MOUSE.ROTATE;
  }, [pan]);
  return (
    <section
      className={`panel viewport ${editing ? "obstacle-editing" : ""}`}
      onKeyDown={(e) => {
        if (
          ["INPUT", "SELECT", "TEXTAREA"].includes(
            (e.target as HTMLElement).tagName,
          )
        )
          return;
        if (e.key === "Escape") {
          e.preventDefault();
          if (state.current?.transform.dragging) {
            state.current.transform.reset();
            state.current.transform.pointerUp(null);
          } else setEditing(false);
        }
        if (
          editing &&
          (e.key.toLowerCase() === "w" || e.key.toLowerCase() === "r")
        ) {
          e.preventDefault();
          setTool(e.key.toLowerCase() === "w" ? "translate" : "scale");
        }
      }}
    >
      <div
        ref={host}
        className="three-host"
        aria-label="Interactive 3D trajectory. Drag to orbit, right-drag to pan, scroll to zoom."
      />
      {error && <div className="webgl-error">{error}</div>}
      <div className="viewport-top">
        <div className="viewport-title">
          <Box size={19} />
          <b>3D Trajectory</b>
          <span className="small-tag">PERSPECTIVE</span>
        </div>
        <div className="viewport-tools">
          <button
            className={!pan ? "active" : ""}
            title="Orbit camera"
            aria-label="Orbit camera"
            onClick={() => setPan(false)}
          >
            <MousePointer2 size={17} />
          </button>
          <button
            className={pan ? "active" : ""}
            title="Pan camera"
            aria-label="Pan camera"
            onClick={() => setPan(true)}
          >
            <Move size={17} />
          </button>
          <i />
          <button
            title="Fit trajectory"
            aria-label="Fit trajectory"
            onClick={() => state.current?.fit()}
          >
            <Expand size={17} />
          </button>
          <button
            title="Reset camera"
            aria-label="Reset camera"
            onClick={() => state.current?.fit()}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <div className="view-gizmo">
        <span className="gizmo-y">Y</span>
        <Box size={34} />
        <span className="gizmo-x">X</span>
        <span className="gizmo-z">Z</span>
      </div>
      <div className="origin-label">
        <span className="origin-dot" /> Emitter origin <b>(0, 0, 0)</b>
      </div>
      {editing &&
        motion.obstacle.visible &&
        editorContainer &&
        createPortal(
          <div
            className="obstacle-inspector"
            role="group"
            aria-label="3D obstacle editor"
          >
            <div className="obstacle-editor-heading">
              <span>
                <Box size={14} />
                Obstacle guide
              </span>
              <button
                onClick={() => setEditing(false)}
                aria-label="Finish obstacle editing"
              >
                <Check size={13} />
                Done
              </button>
            </div>
            <div className="obstacle-editor-tools">
              <div className="segmented">
                <button
                  className={tool === "translate" ? "active" : ""}
                  aria-pressed={tool === "translate"}
                  title="Move obstacle (W)"
                  onClick={() => setTool("translate")}
                >
                  <Move3D size={14} />
                  Move
                </button>
                <button
                  className={tool === "scale" ? "active" : ""}
                  aria-pressed={tool === "scale"}
                  title="Resize obstacle (R)"
                  onClick={() => setTool("scale")}
                >
                  <Scaling size={14} />
                  Resize
                </button>
              </div>
              <button
                className={`snap-toggle ${snap ? "active" : ""}`}
                aria-pressed={snap}
                aria-label="Snap obstacle transforms"
                title={`Snap to ${0.1 * factor} ${motion.units}`}
                onClick={() => setSnap((v) => !v)}
              >
                <Magnet size={14} />
              </button>
            </div>
            <div className="obstacle-value-heading">
              <span>
                {property === "position" ? "Position" : "Dimensions"} (
                {motion.units})
              </span>
              <small>
                {snap ? `${0.1 * factor} ${motion.units} snap` : "Free drag"}
              </small>
            </div>
            <div className="obstacle-axis-inputs">
              {axes.map((a, i) => (
                <label key={`${property}-${a}`} style={{ color: colors[a] }}>
                  <span>{a.toUpperCase()}</span>
                  <NumberField
                    label={`3D obstacle ${property} ${a}`}
                    value={motion.obstacle[property][i] * factor}
                    onCommit={(value) => {
                      const next = structuredClone(motion.obstacle);
                      next[property][i] = value / factor;
                      onObstacleChange(next);
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="obstacle-editor-hint">
              {tool === "translate"
                ? "Drag arrows or plane handles"
                : "Drag square handles · Resize from center"}
              <span>W / R</span>
            </div>
          </div>,
          editorContainer,
        )}
      <div className="viewport-bottom">
        <span className="camera-hint">
          {editing ? (
            "Esc cancels a drag"
          ) : (
            <>
              Drag to orbit <i /> Right-drag to pan <i /> Scroll to zoom
            </>
          )}
        </span>
        <div className="obstacle-view-actions">
          <button
            className={`obstacle-edit-button ${editing ? "active" : ""}`}
            aria-pressed={editing}
            onClick={() => {
              if (!motion.obstacle.visible)
                onObstacleChange({ ...motion.obstacle, visible: true });
              setEditing(!editing);
            }}
          >
            <Move3D size={14} />
            {editing ? "Editing obstacle" : "Edit obstacle"}
          </button>
          <button
            onClick={onObstacle}
            className="obstacle-toggle"
            aria-pressed={motion.obstacle.visible}
          >
            {motion.obstacle.visible ? <Eye size={14} /> : <EyeOff size={14} />}{" "}
            <span className="obstacle-visibility-label">Guide</span>
          </button>
        </div>
      </div>
      <div className="trajectory-legend">
        <span>
          <i className="line-swatch" />
          Trajectory <em>0–{motion.lifetime.toFixed(2)} s</em>
        </span>
        <span>
          <i className="dot-swatch" />
          Velocity key times
        </span>
        <span>
          <i className="current-swatch" />
          Current position
        </span>
      </div>
    </section>
  );
}
