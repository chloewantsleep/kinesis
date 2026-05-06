import PlatformNav from "@/components/platform/PlatformNav";
import ScenarioDemo from "@/components/dashboard/ScenarioDemo";

export default function DashboardDemoPage() {
  return (
    <>
      <PlatformNav />
      <main className="max-w-6xl mx-auto px-4 md:px-10 pt-6 md:pt-12 pb-28 md:pb-12">
        <div className="flex items-end justify-between mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-5xl font-extralight tracking-normal">
              Agent Dashboard <span className="text-muted">/ demo</span>
            </h1>
            <p className="text-sm md:text-base text-muted font-light tracking-wide mt-2">
              Three scripted scenarios showing how Chloe&apos;s Health Agent
              calls the Kinesis and Glasses Agents.
            </p>
          </div>
        </div>
        <ScenarioDemo />
      </main>
    </>
  );
}
