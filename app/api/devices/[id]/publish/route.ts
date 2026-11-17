import { NextRequest } from "next/server";
import { POST as promote } from "../promote/route";

// Kept for older clients: publishing is now the same thing as promoting.
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  return promote(req, ctx);
}
