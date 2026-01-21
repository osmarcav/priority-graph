import * as fs from "node:fs";
import { RoadmapGraph } from "./graph";
import { generatePlan } from "./planGenerator";
import type { GraphData, GraphEdge, GraphNode } from "./types";

export class ReportGenerator {
	private data: GraphData;
	private nodeMap: Map<string, GraphNode>;
	private edgesBySource: Map<string, GraphEdge[]>;
	private edgesByTarget: Map<string, GraphEdge[]>;
	private childrenByParent: Map<string, GraphNode[]>;

	constructor(data: GraphData) {
		this.data = data;
		this.nodeMap = new Map();
		this.edgesBySource = new Map();
		this.edgesByTarget = new Map();
		this.childrenByParent = new Map();

		// Index nodes
		for (const node of data.nodes) {
			this.nodeMap.set(node.id, node);
		}

		// Index edges by source and target
		for (const edge of data.edges) {
			if (!this.edgesBySource.has(edge.source)) {
				this.edgesBySource.set(edge.source, []);
			}
			this.edgesBySource.get(edge.source)?.push(edge);

			if (!this.edgesByTarget.has(edge.target)) {
				this.edgesByTarget.set(edge.target, []);
			}
			this.edgesByTarget.get(edge.target)?.push(edge);
		}

		// Build parent-child hierarchy
		for (const node of data.nodes) {
			if (node.parentId) {
				if (!this.childrenByParent.has(node.parentId)) {
					this.childrenByParent.set(node.parentId, []);
				}
				this.childrenByParent.get(node.parentId)?.push(node);
			}
		}
	}

	generate(): string {
		const lines: string[] = [];

		// Header
		lines.push(`# ${this.data.meta.title}`);
		lines.push("");
		lines.push(
			"This document represents a dependency graph of engineering initiatives. It can be used to identify high-impact starting points and understand how work items relate to each other.",
		);
		lines.push("");
		lines.push("---");
		lines.push("");

		// Glossary
		lines.push(...this.generateGlossary());
		lines.push("");
		lines.push("---");
		lines.push("");

		// Generate Plan of Attack
		const tempGraph = new RoadmapGraph(this.data);
		lines.push(generatePlan(tempGraph));
		lines.push("");
		lines.push("---");
		lines.push("");

		// Get all pillars (top-level nodes with type="pillar")
		const pillars = this.data.nodes.filter(
			(n) => n.type === "pillar" && !n.parentId,
		);

		// Generate content for each pillar
		pillars.forEach((pillar, pillarIndex) => {
			lines.push(...this.generatePillar(pillar, pillarIndex + 1));
			lines.push("");
		});

		return lines.join("\n");
	}

	private generateGlossary(): string[] {
		return [
			"## Glossary",
			"",
			"### Hierarchy",
			"",
			"The graph is organized in four levels, from strategic to tactical:",
			"",
			"| Level                | Format                         | Description                                               |",
			"| -------------------- | ------------------------------ | --------------------------------------------------------- |",
			"| **Strategic Pillar** | `## Strategic Pillar N: Title` | Top-level business outcomes (e.g., reliability, velocity) |",
			"| **Initiative**       | `### Initiative N.M: Title`    | Programs that advance a pillar                            |",
			"| **Problem**          | `#### Problem N.M.P: Title`    | Specific issues blocking an initiative                    |",
			"| **Solution**         | `- Solution: Title`            | Actionable work items that address a problem              |",
			"",
			"### Reference Numbers",
			"",
			"Reference numbers (e.g., `1.2.3`) are positional based on document order:",
			"",
			"- `1` = First Strategic Pillar",
			"- `1.2` = Second Initiative under Pillar 1",
			"- `1.2.3` = Third Problem under Initiative 1.2",
			"",
			"### Relationship Tags",
			"",
			"Tags define edges in the dependency graph. They appear as inline code blocks (e.g., `` `DEPENDS_ON` ``).",
			"",
			"#### Primary Tags (in source data)",
			"",
			"| Tag               | Direction | Meaning                                                         | Algorithm Impact                | Inverse (when target) |",
			"| ----------------- | --------- | --------------------------------------------------------------- | ------------------------------- | --------------------- |",
			"| `DEPENDS_ON`      | A → B     | A requires B to be completed first (known upfront)              | Increases A's blocker count     | `DEPENDENT`           |",
			"| `BLOCKS`          | A → B     | A must finish before B can start (discovered during work)       | Same as DEPENDS_ON semantically | `BLOCKED_BY`          |",
			"| `FACILITATES`     | A → B     | Completing A makes B easier or faster                           | Increases A's impact score      | `FACILITATED_BY`      |",
			"| `RELATES_TO`      | A ↔ B     | A and B share context or concerns                               | Useful for grouping             | `RELATES_TO`          |",
			"| `COORDINATE_WITH` | A ↔ B     | A can proceed in parallel but risk diverging without sync       | Flags coordination need         | `COORDINATE_WITH`     |",
			"| `MITIGATES_RISK`  | A → B     | B reduces the risk associated with A                            | Lowers overall project risk     | `MITIGATES_RISK`      |",
			"",
			"#### Inverse Tags (computed for display)",
			"",
			"Some tags are displayed differently depending on whether you're viewing the source or target node, to make relationships clearer:",
			"",
			"- `DEPENDENT`: Appears when viewing the **target** of a `DEPENDS_ON` edge. Indicates the referenced item is dependent on this item.",
			"- `BLOCKED_BY`: Appears when viewing the **target** of a `BLOCKS` edge. Indicates this item is blocked by the referenced item.",
			"- `FACILITATED_BY`: Appears when viewing the **target** of a `FACILITATES` edge. Indicates this item is made easier by completing the referenced item.",
			"- `RISK_MITIGATED_BY`: Appears when viewing the **source** of a `MITIGATES_RISK` edge. Indicates the risk of this item is reduced by completing the referenced item.",
			"",
			"These inverse tags are not in the source data—they're computed when generating the report to improve readability from each node's perspective.",
			"",
			"### Reference Syntax",
			"",
			"- **Cross-reference**: `Problem 2.1.1: Title` — links to a node by its full path",
			"- **Local reference**: `@Solution title` — links to a sibling solution within the same problem",
			"",
			"### Linking Rules",
			"",
			"- A Solution is implicitly linked to it's parent Problem. The same works for Problems -> Initiatives and Initiative -> Strategic Pillars. The links are only needed for tagging other types of relations:",
			"",
			"- Solutions link to: sibling Solutions (using @), or other Problems",
			"- Problems link to: sibling Problems, or Initiatives in other Pillars",
			"- Initiatives link to: sibling Initiatives or Strategic Pillars",
			"- Cross-pillar links are allowed to capture cross-cutting concerns",
		];
	}

	private generatePillar(pillar: GraphNode, pillarNum: number): string[] {
		const lines: string[] = [];

		// Pillar heading
		const pillarTitle = pillar.description
			? `${pillar.title} ("${pillar.description}")`
			: pillar.title;
		lines.push(`## Strategic Pillar ${pillarNum}: ${pillarTitle}`);
		lines.push("");

		if (pillar.description && pillarTitle === pillar.title) {
			lines.push(`Outcome: ${pillar.description}`);
			lines.push("");
		}

		// Add edges that target this pillar (relationships with other pillars)
		const pillarEdges = this.getRelevantEdges(pillar.id);
		if (pillarEdges.length > 0) {
			lines.push(...this.formatEdges(pillarEdges, pillar.id));
			lines.push("");
		}

		// Get initiatives under this pillar
		const initiatives = this.childrenByParent.get(pillar.id) || [];

		initiatives.forEach((initiative, initIndex) => {
			lines.push(
				...this.generateInitiative(initiative, pillarNum, initIndex + 1),
			);
			lines.push("");
		});

		return lines;
	}

	private generateInitiative(
		initiative: GraphNode,
		pillarNum: number,
		initNum: number,
	): string[] {
		const lines: string[] = [];

		// Initiative heading
		lines.push(`### Initiative ${pillarNum}.${initNum}: ${initiative.title}`);
		lines.push("");

		// Add edges
		const edges = this.getRelevantEdges(initiative.id);
		if (edges.length > 0) {
			lines.push(...this.formatEdges(edges, initiative.id));
			lines.push("");
		}

		// Get problems under this initiative
		const problems = this.childrenByParent.get(initiative.id) || [];

		problems.forEach((problem, probIndex) => {
			lines.push(
				...this.generateProblem(problem, pillarNum, initNum, probIndex + 1),
			);
			if (probIndex < problems.length - 1) {
				lines.push("");
			}
		});

		return lines;
	}

	private generateProblem(
		problem: GraphNode,
		pillarNum: number,
		initNum: number,
		probNum: number,
	): string[] {
		const lines: string[] = [];

		// Problem heading
		lines.push(
			`#### Problem ${pillarNum}.${initNum}.${probNum}: ${problem.title}`,
		);
		lines.push("");

		// Add edges
		const edges = this.getRelevantEdges(problem.id);
		if (edges.length > 0) {
			lines.push(...this.formatEdges(edges, problem.id));
			lines.push("");
		}

		// Get solutions under this problem
		const solutions = this.childrenByParent.get(problem.id) || [];

		solutions.forEach((solution) => {
			lines.push(...this.generateSolution(solution, problem.id));
		});

		return lines;
	}

	private generateSolution(solution: GraphNode, problemId: string): string[] {
		const lines: string[] = [];

		// Solution line
		lines.push(`- Solution: ${solution.title}`);

		// Add edges (indented)
		const edges = this.getRelevantEdges(solution.id);
		if (edges.length > 0) {
			const edgeLines = this.formatEdges(edges, solution.id, problemId);
			lines.push(...edgeLines.map((line) => `  ${line}`));
		}

		return lines;
	}

	private getRelevantEdges(nodeId: string): GraphEdge[] {
		const outgoing = this.edgesBySource.get(nodeId) || [];
		const incoming = this.edgesByTarget.get(nodeId) || [];

		// Filter out parent-child relationships (those are implicit)
		const node = this.nodeMap.get(nodeId);
		if (!node) {
			return [];
		}
		const relevantEdges: GraphEdge[] = [];

		// Add outgoing edges (except those that are implicit parent-child)
		for (const edge of outgoing) {
			const target = this.nodeMap.get(edge.target);
			if (target && target.parentId !== nodeId) {
				relevantEdges.push(edge);
			}
		}

		// Add incoming edges (except those that are implicit parent-child)
		for (const edge of incoming) {
			const source = this.nodeMap.get(edge.source);
			if (source && node.parentId !== edge.source) {
				relevantEdges.push(edge);
			}
		}

		return relevantEdges;
	}

	private formatEdges(
		edges: GraphEdge[],
		currentNodeId: string,
		currentParentId?: string,
	): string[] {
		const lines: string[] = [];

		for (const edge of edges) {
			const isOutgoing = edge.source === currentNodeId;
			const otherNodeId = isOutgoing ? edge.target : edge.source;
			const otherNode = this.nodeMap.get(otherNodeId);

			if (!otherNode) continue;

			// Determine if this is a local reference or cross-reference
			const isLocalSibling =
				currentParentId && otherNode.parentId === currentParentId;

			let reference: string;
			if (isLocalSibling && otherNode.type === "solution") {
				// Local reference with @
				reference = `@${otherNode.title}`;
			} else {
				// Cross-reference with full path
				reference = this.getNodePath(otherNode);
			}

			// Determine the edge type to display (can be actual EdgeType or inverse pseudo-tag)
			let displayType: string = edge.type;

			// Apply transformations based on direction and semantics
			if (!isOutgoing) {
				// Current node is TARGET of the edge
				switch (edge.type) {
					case "DEPENDS_ON":
						// If A depends on B, then from B's perspective: A is a dependent
						displayType = "DEPENDENT";
						break;
					case "BLOCKS":
						// If A blocks B, then from B's perspective: blocked by A
						displayType = "BLOCKED_BY";
						break;
					case "FACILITATES":
						// If A facilitates B, then B is facilitated by A
						displayType = "FACILITATED_BY";
						break;
					// Bidirectional edges stay the same
					case "RELATES_TO":
					case "COORDINATE_WITH":
						displayType = edge.type;
						break;
					// MITIGATES_RISK: when target, we mitigate the source's risk
					case "MITIGATES_RISK":
						// No change - target mitigates source's risk
						displayType = "MITIGATES_RISK";
						break;
				}
			} else {
				// Current node is SOURCE of the edge
				switch (edge.type) {
					case "MITIGATES_RISK":
						// If A->B with MITIGATES_RISK, B mitigates A's risk
						// So from A's perspective: risk is mitigated by B
						displayType = "RISK_MITIGATED_BY";
						break;
					default:
						// Keep original type
						displayType = edge.type;
						break;
				}
			}

			// Format the edge
			let edgeLine = `\`${displayType}\`: ${reference}`;

			// Add annotation if present
			if (edge.annotation) {
				edgeLine += ` (${edge.annotation})`;
			}

			lines.push(edgeLine);
		}

		return lines;
	}

	private getNodePath(node: GraphNode): string {
		// Build the full path for cross-references
		const path: string[] = [];

		let current: GraphNode | undefined = node;
		while (current) {
			path.unshift(current.title);
			current = current.parentId
				? this.nodeMap.get(current.parentId)
				: undefined;
		}

		// Format based on node type
		let typeLabel = "";
		switch (node.type) {
			case "pillar":
				typeLabel = "Strategic Pillar";
				break;
			case "initiative":
				typeLabel = "Initiative";
				break;
			case "problem":
				typeLabel = "Problem";
				break;
			case "solution":
				typeLabel = "Solution";
				break;
		}

		// Get position numbers
		const numbers = this.getPositionNumbers(node);
		const ref = numbers ? `${typeLabel} ${numbers}` : typeLabel;

		return `${ref}: ${node.title}`;
	}

	private getPositionNumbers(node: GraphNode): string | null {
		const positions: number[] = [];

		let current: GraphNode | undefined = node;
		while (current) {
			if (current.parentId) {
				const parent = this.nodeMap.get(current.parentId);
				if (parent) {
					const siblings = this.childrenByParent.get(current.parentId) || [];
					const index = siblings.findIndex((s) => s.id === current?.id);
					if (index !== -1) {
						positions.unshift(index + 1);
					}
				}
			} else {
				// Top-level pillar
				const pillars = this.data.nodes.filter(
					(n) => n.type === "pillar" && !n.parentId,
				);
				const index = pillars.findIndex((p) => p.id === current?.id);
				if (index !== -1) {
					positions.unshift(index + 1);
				}
			}
			current = current.parentId
				? this.nodeMap.get(current.parentId)
				: undefined;
		}

		return positions.length > 0 ? positions.join(".") : null;
	}

	writeToFile(outputPath: string): void {
		const content = this.generate();
		fs.writeFileSync(outputPath, content, "utf-8");
	}
}
