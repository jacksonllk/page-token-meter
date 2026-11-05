import { HomePage } from "./components/home-page";
import { Meter } from "./components/meter";

export default function Home() {
  return (
    <HomePage>
      <Meter fixtures={process.env.PTM_FIXTURES === "1"} />
    </HomePage>
  );
}
