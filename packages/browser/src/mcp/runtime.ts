import { ManagedRuntime } from "effect";
import { McpSession } from "./mcp-session.js";

export const McpRuntime = ManagedRuntime.make(McpSession.layer);
