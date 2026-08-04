import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
	...defineCloudflareConfig({
		// Uncomment to enable R2 cache,
		// It should be imported as:
		// `import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";`
		// See https://opennext.js.org/cloudflare/caching for more details
		// incrementalCache: r2IncrementalCache,
	}),
	// Build Next.js directly (not via `npm run build`) so the `build` script can
	// invoke OpenNext without recursively calling itself. OpenNext enables
	// standalone output mode before running this command.
	buildCommand: "npx next build",
};
