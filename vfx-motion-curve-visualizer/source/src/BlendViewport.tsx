import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  at,
  endpoint,
  pathCopy,
  seededWeight,
  type BlendDocument,
} from "./blend";
import type { Vec3 } from "./motion";
type Props = {
  doc: BlendDocument;
  active: number;
  point: number;
  age: number;
  weight: number;
  count: number;
  dots: boolean;
  fit: number;
  onSelect: (i: number) => void;
  onMove: (v: Vec3, index?: number) => void;
  onBegin: () => void;
  onEnd: (cancel: boolean) => void;
};
export function BlendViewport(props: Props) {
  const [view, setView] = useState("perspective"),
    [plane, setPlane] = useState("screen");
  const viewRef = useRef(view),
    planeRef = useRef(plane);
  viewRef.current = view;
  planeRef.current = plane;
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  const state = useRef<{
    scene: THREE.Scene;
    group: THREE.Group;
    camera: THREE.PerspectiveCamera;
    orbit: OrbitControls;
    transform: TransformControls;
    handle: THREE.Object3D;
    drag: boolean;
    fit: () => void;
    cancel: () => void;
    labels: { element: HTMLSpanElement; position: THREE.Vector3 }[];
  } | null>(null);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      el.textContent = "Enable WebGL hardware acceleration for 3D.";
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#101922");
    el.append(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(40, 1, 0.01, 2000);
    camera.up.set(0, 0, 1);
    camera.position.set(12, 10, 16);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.disconnect();
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setColors(0x28e1ed, 0xffc654, 0xc47bff, 0xffffff);
    transform.setMode("translate");
    transform.setSize(0.85);
    scene.add(transform.getHelper());
    orbit.connect(renderer.domElement);
    const group = new THREE.Group(),
      handle = new THREE.Object3D();
    scene.add(group, handle);
    const grid = new THREE.GridHelper(40, 40, 0x334957, 0x20303b);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    const axesHelper = new THREE.AxesHelper(2);
    axesHelper.setColors(0x28e1ed, 0xffc654, 0xc47bff);
    scene.add(axesHelper);
    const fit = () => {
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3()),
        size = Math.max(box.getSize(new THREE.Vector3()).length(), 1);
      orbit.target.copy(center);
      const direction =
        viewRef.current === "top"
          ? new THREE.Vector3(0, 0, 1)
          : viewRef.current === "front"
            ? new THREE.Vector3(0, -1, 0)
            : viewRef.current === "side"
              ? new THREE.Vector3(1, 0, 0)
              : new THREE.Vector3(0.8, -1, 0.7);
      camera.up.set(
        0,
        viewRef.current === "top" ? 1 : 0,
        viewRef.current === "top" ? 0 : 1,
      );
      camera.position.copy(center).add(direction.normalize().multiplyScalar(size * 1.25 / Math.min(1,camera.aspect)));
      camera.far = Math.max(2000, size * 10);
      camera.updateProjectionMatrix();
      orbit.update();
    };
    const s = {
      scene,
      group,
      camera,
      orbit,
      transform,
      handle,
      drag: false,
      fit,
      cancel: () => {},
      labels: [] as { element: HTMLSpanElement; position: THREE.Vector3 }[],
    };
    state.current = s;
    transform.addEventListener("dragging-changed", (e) => {
      s.drag = !!e.value;
      orbit.enabled = !e.value;
      if (e.value) latest.current.onBegin();
      else latest.current.onEnd(false);
    });
    transform.addEventListener("objectChange", () => {
      if (s.drag) latest.current.onMove(handle.position.toArray() as Vec3);
    });
    let direct: {
      id: number;
      index: number;
      origin: THREE.Vector3;
      start: THREE.Vector3;
      plane: THREE.Plane;
    } | null = null;
    const rayFor = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      return ray;
    };
    const pick = (e: PointerEvent) => {
      if (e.button !== 0 || e.altKey) return;
      const rect = el.getBoundingClientRect();
      let best: THREE.Object3D | undefined,
        dist = 16;
      group.children.forEach((o) => {
        if (o.userData.point === undefined) return;
        const p = o.position.clone().project(camera);
        if (p.z < -1 || p.z > 1) return;
        const d = Math.hypot(
          ((p.x + 1) * rect.width) / 2 - (e.clientX - rect.left),
          ((-p.y + 1) * rect.height) / 2 - (e.clientY - rect.top),
        );
        if (d < dist) {
          dist = d;
          best = o;
        }
      });
      if (!best) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      el.focus();
      const index = best.userData.point as number,
        origin = best.position.clone(),
        choice = planeRef.current;
      const normal =
        choice === "xy"
          ? new THREE.Vector3(0, 0, 1)
          : choice === "xz"
            ? new THREE.Vector3(0, 1, 0)
            : choice === "yz"
              ? new THREE.Vector3(1, 0, 0)
              : camera.getWorldDirection(new THREE.Vector3());
      const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          normal,
          origin,
        ),
        hit = rayFor(e).ray.intersectPlane(dragPlane, new THREE.Vector3());
      latest.current.onSelect(index);
      if (!hit) return;
      latest.current.onBegin();
      direct = { id: e.pointerId, index, origin, start: hit, plane: dragPlane };
      s.drag = true;
      orbit.enabled = false;
      transform.enabled = false;
      transform.getHelper().visible = false;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!direct) return;
      const hit = rayFor(e).ray.intersectPlane(
        direct.plane,
        new THREE.Vector3(),
      );
      if (hit) {
        const v = direct.origin.clone().add(hit.sub(direct.start));
        latest.current.onMove(v.toArray() as Vec3, direct.index);
        s.handle.position.copy(v);
      }
      e.stopImmediatePropagation();
    };
    const finish = (cancel: boolean) => {
      if (!direct) return;
      const id = direct.id;
      direct = null;
      s.drag = false;
      orbit.enabled = true;
      transform.enabled = true;
      transform.getHelper().visible = true;
      renderer.domElement.style.cursor = "";
      latest.current.onEnd(cancel);
      if (renderer.domElement.hasPointerCapture(id))
        renderer.domElement.releasePointerCapture(id);
    };
    const up = (e: PointerEvent) => {
      if (direct) {
        e.stopImmediatePropagation();
        finish(false);
      }
    };
    const cancel = () => {
      if (direct) finish(true);
      else if (s.drag) {
        transform.reset();
        s.drag = false;
        latest.current.onEnd(true);
        transform.pointerUp(null);
        orbit.enabled = true;
      }
    };
    s.cancel = cancel;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && s.drag) {
        e.preventDefault();
        cancel();
      }
    };
    const cancelPointer = () => cancel();
    renderer.domElement.addEventListener("pointerdown", pick, true);
    renderer.domElement.addEventListener("pointermove", move, true);
    renderer.domElement.addEventListener("pointerup", up, true);
    renderer.domElement.addEventListener("pointercancel", cancelPointer);
    const captureLost=()=>{if(direct)finish(true);};
    renderer.domElement.addEventListener('lostpointercapture',captureLost);
    window.addEventListener("blur", cancelPointer);
    el.addEventListener("keydown", key);
    const resize = new ResizeObserver(() => {
      cancel();
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });
    resize.observe(el);
    let frame = 0;
    const render = () => {
      orbit.update();
      s.labels.forEach(({ element, position }) => {
        const p = position.clone().project(camera);
        element.style.display = p.z < -1 || p.z > 1 ? "none" : "";
        element.style.transform = `translate(${((p.x + 1) * el.clientWidth) / 2 + 10}px,${((-p.y + 1) * el.clientHeight) / 2 - 20}px)`;
      });
      group.children.forEach((o) => {
        if (o.userData.point !== undefined) {
          const units =
            (camera.position.distanceTo(o.position) *
              2 *
              Math.tan((camera.fov * Math.PI) / 360)) /
            el.clientHeight;
          o.scale.setScalar((units * 9) / 0.075);
        }
      });
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pick, true);
      renderer.domElement.removeEventListener("pointermove", move, true);
      renderer.domElement.removeEventListener("pointerup", up, true);
      renderer.domElement.removeEventListener("pointercancel", cancelPointer);
      renderer.domElement.removeEventListener('lostpointercapture',captureLost);
      window.removeEventListener("blur", cancelPointer);
      s.labels.forEach((l) => l.element.remove());
      el.removeEventListener("keydown", key);
      transform.dispose();
      orbit.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.labels.forEach((l) => l.element.remove());
    s.labels = [];
    while (s.group.children.length) {
      const obj = s.group.children[0];
      s.group.remove(obj);
      obj.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
    }
    const line = (
      points: Vec3[],
      color: number,
      opacity = 1,
      dashed = false,
    ) => {
      const geo = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(...p)),
      );
      const obj = new THREE.Line(
        geo,
        dashed
          ? new THREE.LineDashedMaterial({
              color,
              transparent: true,
              opacity,
              dashSize: 0.15,
              gapSize: 0.1,
            })
          : new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      );
      if (dashed) obj.computeLineDistances();
      s.group.add(obj);
    };
    const sphere = (p: Vec3, color: number, r = 0.055, index?: number) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 8),
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.position.set(...p);
      if (index !== undefined) mesh.userData.point = index;
      s.group.add(mesh);
      if (index !== undefined) {
        const element = document.createElement("span");
        element.className = `path-point-label ${index === props.point ? "selected" : ""}`;
        element.textContent = String(index + 1);
        host.current!.append(element);
        s.labels.push({ element, position: mesh.position.clone() });
      }
    };
    for (let i = 0; i < props.count; i++) {
      const b = seededWeight(props.doc.seed, i);
      line(
        Array.from(
          { length: 161 },
          (_, j) => at(props.doc, j / 160, b).position,
        ),
        0x718fa4,
        0.22,
      );
    }
    [0, 1].forEach((k) => {
      const color = k === 0 ? 0x28e1ed : 0xffc654;
      line(
        Array.from(
          { length: 201 },
          (_, j) =>
            endpoint(props.doc.profiles[k], j / 200, props.doc.lifetime)
              .position,
        ),
        color,
        1,
        k === 1,
      );
      sphere(
        endpoint(props.doc.profiles[k], props.age, props.doc.lifetime).position,
        color,
        0.085,
      );
    });
    line(
      Array.from(
        { length: 201 },
        (_, j) => at(props.doc, j / 200, props.weight).position,
      ),
      0xffffff,
      0.85,
    );
    sphere(at(props.doc, props.age, props.weight).position, 0xffffff, 0.1);
    line(
      [
        endpoint(props.doc.profiles[0], props.age, props.doc.lifetime).position,
        endpoint(props.doc.profiles[1], props.age, props.doc.lifetime).position,
      ],
      0xffffff,
      0.5,
    );
    if (props.dots)
      for (let j = 0; j <= 20; j++)
        sphere(at(props.doc, j / 20, props.weight).position, 0xa1c6d6, 0.035);
    const p = pathCopy(props.doc.profiles[props.active], props.doc.lifetime);
    p.points.forEach((k, i) =>
      sphere(
        k.value.map((x, c) => x * p.scale[c]) as Vec3,
        i === props.point ? 0xffffff : props.active === 0 ? 0x28e1ed : 0xffc654,
        0.075,
        i,
      ),
    );
    if (!s.drag) {
      const point = p.points[Math.min(props.point, p.points.length - 1)];
      s.handle.position.set(
        ...(point.value.map((x, c) => x * p.scale[c]) as Vec3),
      );
      s.transform.attach(s.handle);
      s.transform.showX = p.scale[0] !== 0;
      s.transform.showY = p.scale[1] !== 0;
      s.transform.showZ = p.scale[2] !== 0;
    }
  }, [
    props.doc,
    props.active,
    props.point,
    props.age,
    props.weight,
    props.count,
    props.dots,
  ]);
  useEffect(() => {
    state.current?.fit();
  }, [props.fit]);
  useEffect(() => {
    state.current?.cancel();
    state.current?.fit();
  }, [view]);
  useEffect(() => {
    state.current?.cancel();
  }, [plane]);
  return (
    <div className="blend-canvas-wrap">
      <div className="spatial-edit-tools">
        <label>
          View
          <select
            aria-label="3D view"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            <option value="perspective">Perspective · Z up</option>
            <option value="top">Top · XY</option>
            <option value="front">Front · XZ</option>
            <option value="side">Side · YZ</option>
          </select>
        </label>
        <label>
          Drag plane
          <select
            aria-label="Point drag plane"
            value={plane}
            onChange={(e) => setPlane(e.target.value)}
          >
            <option value="screen">Screen</option>
            <option value="xy">XY · ground</option>
            <option value="xz">XZ</option>
            <option value="yz">YZ</option>
          </select>
        </label>
      </div>
      <div
        className="blend-canvas"
        tabIndex={0}
        aria-label="Editable Z-up 3D paths. Drag a numbered point directly, or drag its axis handle. Escape cancels a drag."
        ref={host}
      />
      <div className="spatial-edit-hint">
        Drag a numbered point · Empty space orbits · Esc cancels
      </div>
    </div>
  );
}
