import type { RoadTask } from "@/content/roads/tasks";
function Walker({ x, y }: { x: number; y: number }) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
    >
      <circle cy="-13" r="4" fill="currentColor" />
      <path d="M0 -5 L-5 8 L-12 20 M-5 8 L8 20 M-1 -3 L12 4 M-2 0 L-13 6" />
    </g>
  );
}
export function Scene({ scene }: { scene: RoadTask["scene"] }) {
  if (!scene) return null;
  if (scene === "signs")
    return (
      <svg
        className="road-scene"
        viewBox="0 0 480 155"
        role="img"
        aria-label="Три дорожных знака: А — синий квадрат, человек на полосках в белом треугольнике; Б — красный треугольник с двумя бегущими детьми; В — синий круг с пешеходом"
      >
        <rect x="25" y="10" width="110" height="110" rx="5" fill="#0866a5" />
        <path d="M80 22 L125 106 H35 Z" fill="white" />
        <g stroke="#10243e" strokeWidth="4">
          <path d="M48 102 H112 M55 94 H105" />
        </g>
        <g color="#10243e">
          <Walker x={82} y={70} />
        </g>
        <path
          d="M240 10 L300 115 H180 Z"
          fill="white"
          stroke="#d52c35"
          strokeWidth="8"
        />
        <g color="#10243e">
          <Walker x={230} y={72} />
          <g transform="translate(19 13) scale(.8)">
            <Walker x={282} y={72} />
          </g>
        </g>
        <circle cx="400" cy="65" r="55" fill="#0866a5" />
        <g color="white">
          <Walker x={400} y={65} />
        </g>
        <g textAnchor="middle" fontSize="23" fontWeight="bold" fill="#10243e">
          <text x="80" y="148">
            А
          </text>
          <text x="240" y="148">
            Б
          </text>
          <text x="400" y="148">
            В
          </text>
        </g>
      </svg>
    );
  if (scene === "red" || scene === "green")
    return (
      <svg
        className="road-scene road-light"
        viewBox="0 0 140 210"
        role="img"
        aria-label={
          scene === "red"
            ? "Пешеходный светофор: горит красный стоящий человечек"
            : "Пешеходный светофор: горит зелёный идущий человечек"
        }
      >
        <rect x="25" y="5" width="90" height="180" rx="20" fill="#10243e" />
        <circle
          cx="70"
          cy="52"
          r="34"
          fill={scene === "red" ? "#d52c35" : "#344458"}
        />
        <circle
          cx="70"
          cy="137"
          r="34"
          fill={scene === "green" ? "#23824c" : "#344458"}
        />
        <g
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          fill="white"
          opacity={scene === "red" ? 1 : 0.25}
        >
          <circle cx="70" cy="35" r="4" />
          <path d="M70 45 V59 M61 47 V58 M79 47 V58 M66 60 V72 M74 60 V72" />
        </g>
        <g color="white" opacity={scene === "green" ? 1 : 0.25}>
          <Walker x={70} y={134} />
        </g>
      </svg>
    );
  return (
    <svg
      className="road-scene"
      viewBox="0 0 500 230"
      role="img"
      aria-label={
        scene === "route"
          ? "Дом слева сверху, школа слева снизу. Между ними дорога. Путь А пересекает её без перехода. Путь Б идёт по тротуару направо к зебре и обратно к школе."
          : "Пешеходная зебра через дорогу с двумя полосами. С обеих сторон тротуары."
      }
    >
      <rect width="500" height="230" rx="20" fill="#e0f3dc" />
      <path d="M0 70 H500 V160 H0 Z" fill="#53687b" />
      <path
        d="M0 115 H500"
        stroke="white"
        strokeDasharray="18 14"
        strokeWidth="3"
      />
      <path d="M0 55 H500 M0 175 H500" stroke="#f4dfb5" strokeWidth="24" />
      {[76, 92, 108, 124, 140].map((y) => (
        <rect key={y} x="357" y={y} width="60" height="10" fill="white" />
      ))}
      {scene === "route" ? (
        <>
          <path
            d="M80 38 V195"
            stroke="#8f5060"
            strokeWidth="5"
            strokeDasharray="6 5"
          />
          <path
            d="M80 38 H387 V195 H80"
            stroke="#0866a5"
            strokeWidth="5"
            fill="none"
          />
          <g fontSize="18" fontWeight="bold" fill="#10243e">
            <text x="18" y="28">
              Дом
            </text>
            <text x="12" y="222">
              Школа
            </text>
            <text x="94" y="115">
              А
            </text>
            <text x="235" y="30">
              Б
            </text>
          </g>
        </>
      ) : (
        <>
          <rect x="135" y="80" width="70" height="25" rx="7" fill="#ffcf4a" />
          <rect x="235" y="125" width="70" height="25" rx="7" fill="#b6dfff" />
          <g color="#10243e">
            <Walker x={387} y={35} />
          </g>
        </>
      )}
    </svg>
  );
}
