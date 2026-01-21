import * as fs from "node:fs";
import * as path from "node:path";
import type { GraphNode } from "./types";

export class GraphOptimizer {
	private cachePath: string;

	constructor() {
		this.cachePath = path.join(
			process.cwd(),
			"data",
			"priority-graph-optimized.json",
		);
	}

	loadOptimizedData(): { descendants: Record<string, string[]> } | null {
		try {
			if (fs.existsSync(this.cachePath)) {
				const data = fs.readFileSync(this.cachePath, "utf-8");
				return JSON.parse(data);
			}
		} catch (e) {
			// Silently fail on cache read errors
		}
		return null;
	}

	saveOptimizedData(descendants: Record<string, string[]>): void {
		try {
			const data = JSON.stringify({ descendants }, null, 2);
			const dir = path.dirname(this.cachePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(this.cachePath, data);
		} catch (e) {
			console.error("Failed to save optimized graph data:", e);
		}
	}

	computeDescendants(nodes: GraphNode[]): Record<string, string[]> {
		const childrenMap = new Map<string, string[]>();
		const result: Record<string, string[]> = {};

		// Build parent-child map
		for (const node of nodes) {
			result[node.id] = [];
			if (node.parentId) {
				if (!childrenMap.has(node.parentId)) {
					childrenMap.set(node.parentId, []);
				}
				childrenMap.get(node.parentId)?.push(node.id);
			}
		}

		// Compute descendants for each node
		// We iterate all nodes to ensure the record is complete
		for (const node of nodes) {
			result[node.id] = this.getDescendantsRecursive(node.id, childrenMap);
		}

		return result;
	}

	private getDescendantsRecursive(
		nodeId: string,
		childrenMap: Map<string, string[]>,
	): string[] {
		const descendants: string[] = [];
		const children = childrenMap.get(nodeId) || [];

		for (const childId of children) {
			descendants.push(childId);
			const subDescendants = this.getDescendantsRecursive(childId, childrenMap);
			descendants.push(...subDescendants);
		}

		return descendants;
	}
}
