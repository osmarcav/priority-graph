export type NodeType = "pillar" | "initiative" | "problem" | "solution";

export type EdgeType =
	| "DEPENDS_ON"
	| "BLOCKS"
	| "FACILITATES"
	| "RELATES_TO"
	| "COORDINATE_WITH"
	| "MITIGATES_RISK"; // Source mitigates risk for target

export type NodeStatus = "backlog" | "ready" | "in_progress" | "done";

/**
 * Conditional effort modifier.
 * When all nodes in `whenCompleted` are done, effort becomes `effort`.
 * Multiple modifiers are evaluated, and the lowest effort wins.
 */
export interface EffortModifier {
	whenCompleted: string[]; // Node IDs that must be completed
	effort: number; // New effort value when condition is met
	reason?: string; // Optional explanation
}

export interface GraphNode {
	id: string;
	type: NodeType;
	title: string;
	description?: string;
	parentId?: string;
	status?: NodeStatus;

	// Effort modeling (volume of work)
	effort?: number; // Base effort in story points
	effortModifiers?: EffortModifier[]; // Conditional effort reductions

	// Uncertainty modeling (discovery/research overhead)
	uncertainty?: number; // Multiplier: 1.0 = known, 2.0 = significant unknowns

	// Risk modeling (probability of rework/failure)
	risk?: number; // Base risk: 0.0 (safe) to 1.0 (dangerous)
	riskFactors?: string[]; // Why is this risky?
}

export interface GraphEdge {
	id: string;
	source: string;
	target: string;
	type: EdgeType;
	annotation?: string;

	// For MITIGATES_RISK edges
	riskReduction?: number; // How much risk is reduced (0.0-1.0)
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
