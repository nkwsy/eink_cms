import Link from "next/link";
import { listPluginTypes } from "@/lib/plugins/registry";
import NewPluginForm from "./NewPluginForm";

export const dynamic = "force-dynamic";

export default function NewPluginPage() {
  const types = listPluginTypes();
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">New plugin instance</h1>
        <Link href="/plugins" className="text-sm text-neutral-400 hover:text-emerald-400">← Back</Link>
      </div>
      <NewPluginForm types={types} />
    </div>
  );
}
