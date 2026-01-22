import type { z } from "zod";
import type {
	EdgeTypeSchema,
	NodeTypeSchema,
	RoadmapGraphSchema,
} from "./validator";

export type NodeType = z.infer<typeof NodeTypeSchema>;

export type EdgeType = z.infer<typeof EdgeTypeSchema>;

// Inferred types from validator schemas (for external data)
export type RoadmapGraph = z.infer<typeof RoadmapGraphSchema>;
export type ValidatedNode = RoadmapGraph["nodes"][number];
export type ValidatedEdge = RoadmapGraph["edges"][number];

export type NodeStatus = "backlog" | "ready" | "in_progress" | "done";

export interface GraphNode {
	id: string;
	type: NodeType;
	title: string;
	description?: string;
	parentId?: string;
	status?: NodeStatus;

	// Solution node metrics (only for type="solution")
	baseEffort?: number; // Base effort in story points
	baseRisk?: number; // Base risk: 0.0 (safe) to 1.0 (dangerous)
	baseUncertainty?: number; // Base uncertainty: 0.0 (known) to 1.0 (high unknowns)
}

export interface GraphEdge {
	id: string;
	source: string;
	target: string;
	type: EdgeType;
	annotation?: string;
	strength?: number; // General edge strength (0.0-1.0)

	// For FACILITATES, DERISKS, INFORMS edges
	factor?: number; // Reduction factor (0.0-1.0)
}

/**
 * Derived edge aggregated from child node connections.
 * Used to show cross-cutting relationships at higher levels (pillar, initiative, problem).
 */
export interface DerivedEdge {
	source: string; // Parent node ID
	target: string; // Parent node ID
	type: EdgeType;
	weight: number; // Count of child edges contributing to this relationship
	childEdges: string[]; // IDs of contributing child edges
}

export interface GraphData {
	meta: {
		version: string;
		title: string;
		generatedAt: string;
	};
	nodes: GraphNode[];
	edges: GraphEdge[];
}

// Computed metrics for each node
export interface NodeMetrics {
	id: string;
	title: string;
	type: NodeType;

	// Basic degree metrics
	inDegree: number; // How many nodes point to this (blockers)
	outDegree: number; // How many nodes this points to (enables)
	dependsOnCount: number; // What this depends on (incoming dependencies including inherited)
	dependedOnByCount: number; // What depends on this (nodes blocked by this)
	weightedBlockingCount: number; // Weighted blocks (includes descendants of blocked nodes)
	facilitatesCount: number; // Outgoing FACILITATES edges (soft impact)

	// Effort metrics
	directEffort: number; // Own effort (solutions only)
	totalEffort: number; // Sum of descendant efforts

	// Uncertainty metrics
	uncertainty: number; // Discovery multiplier
	adjustedEffort: number; // effort × uncertainty

	// Risk metrics
	baseRisk: number; // Original risk before mitigations
	adjustedRisk: number; // Risk after applying completed mitigators
	riskMitigationValue: number; // How much risky work this makes safe

	// Computed scores
	readiness: number; // 1 / (unmet_dependencies + 1)
	leverage: number; // downstream_effort / own_effort
	safetyFactor: number; // 1 - adjustedRisk (higher = safer to do)
	priorityScore: number; // Combined metric for ranking

	// Topological info
	topoLevel: number; // Level in dependency DAG (0 = no blockers)

	// PageRank-style influence
	influenceScore: number; // How much completing this enables

	// Cross-cutting relationships (for hierarchical nodes)
	crossCuttingEdges?: DerivedEdge[]; // Aggregated edges from children to other branches
}
