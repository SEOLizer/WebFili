import { useEffect, useReducer } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { simState } from '../../simulation/simState';
import { getPacketColor } from '../../engine/packet';
import { useSimulationUiStore } from '../../stores/simulationUiStore';

export default function PacketOverlay() {
  const mode = useSimulationUiStore((s) => s.mode);
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const { getNode } = useReactFlow();
  const viewport = useViewport();

  useEffect(() => {
    if (mode !== 'simulate') return;
    let rafId: number;
    const animate = () => { tick(); rafId = requestAnimationFrame(animate); };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [mode]);

  if (mode !== 'simulate') return null;

  const { x: vx, y: vy, zoom } = viewport;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
        overflow: 'visible',
      }}
    >
      <g transform={`translate(${vx}, ${vy}) scale(${zoom})`}>
        {simState.transitPackets.map((tp) => {
          const fromNode = getNode(tp.fromDeviceId);
          const toNode = getNode(tp.toDeviceId);
          if (!fromNode || !toNode) return null;

          const fw = (fromNode.measured?.width ?? 72) / 2;
          const fh = (fromNode.measured?.height ?? 60) / 2;
          const tw = (toNode.measured?.width ?? 72) / 2;
          const th = (toNode.measured?.height ?? 60) / 2;

          const x1 = fromNode.position.x + fw;
          const y1 = fromNode.position.y + fh;
          const x2 = toNode.position.x + tw;
          const y2 = toNode.position.y + th;

          const t = tp.progress;
          const cx = x1 + (x2 - x1) * t;
          const cy = y1 + (y2 - y1) * t;

          const color = getPacketColor(tp.packet);

          return (
            <g key={tp.id}>
              <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.9} />
              <circle cx={cx} cy={cy} r={8} fill="none" stroke={color} strokeWidth={2} opacity={0.5} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
