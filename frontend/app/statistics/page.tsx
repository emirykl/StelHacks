import type { Metadata } from "next";
import { Measure, ButtonLink } from "../components/primitives";
import { loadStatistics } from "../../lib/statistics-server";
import { Dashboard } from "./dashboard";

export const metadata: Metadata = { description: "The StelHacks community in numbers. Explore participation, countries and projects across hackathons." };
export const revalidate = 0;

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const params = await searchParams;
  const scope = (Array.isArray(params.event) ? params.event[0] : params.event) || "current";
  let data;
  try {
    data = await loadStatistics(scope);
  } catch (error) {
    console.error("Statistics unavailable:", error instanceof Error ? error.message : "Unknown error");
    return <main className="flex-1"><Measure wide className="py-20"><h1 className="mt-5 text-5xl">Statistics</h1><div className="mt-12 rounded-2xl border border-rule p-8"><h2 className="text-2xl">Statistics are temporarily unavailable.</h2><ButtonLink href="/statistics" intent="quiet" className="mt-6">Try again</ButtonLink></div></Measure></main>;
  }
  return <main className="flex-1"><Measure wide className="py-8 sm:py-10"><Dashboard data={data} /></Measure></main>;
}
