export function FlairSVGFilters(): React.ReactNode {
  return (
    <svg
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
      aria-hidden="true">
      <defs>
        <filter
          id="bsky-flame-turb"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012"
            numOctaves={3}
            seed={1}
            result="noise">
            <animate
              attributeName="seed"
              from="1"
              to="100"
              dur="4s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={10}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <filter
          id="bsky-flame-turb-2"
          x="-15%"
          y="-15%"
          width="130%"
          height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018"
            numOctaves={2}
            seed={50}
            result="noise2">
            <animate
              attributeName="seed"
              from="50"
              to="200"
              dur="3s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise2"
            scale={8}
            xChannelSelector="G"
            yChannelSelector="B"
          />
        </filter>
      </defs>
    </svg>
  )
}
