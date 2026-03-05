export default function RvSpeakerTooltip({ speakerTooltip }) {
  if (!speakerTooltip?.visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: speakerTooltip.x,
        top: speakerTooltip.y,
        pointerEvents: 'none',
        background: '#F5F5F5',
        color: '#111',
        border: '1px solid rgba(0,0,0,0.12)',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        fontFamily: 'system-ui, sans-serif',
        zIndex: 9999,
        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
        whiteSpace: 'nowrap',
      }}
    >
      {speakerTooltip.text}
    </div>
  );
}