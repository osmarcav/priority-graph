import { GraphOptimizer } from "./graphOptimizer";
import type {
	DerivedEdge,
	EdgeType,
	GraphData,
	GraphEdge,
	GraphNode,
	NodeMetrics,
	NodeType,
} from "./types";

export interface CompletionImpact {
	nodeId: string;
	nodeTitle: string;

	// Nodes now unblocked
	nowReady: Array<{ id: string; title: string; effort: number }>;

	// Nodes with reduced effort
	effortReductions: Array<{
		id: string;
		title: string;
		oldEffort: number;
		newEffort: number;
		reason?: string;
	}>;

	// Nodes with reduced risk (NEW)
	riskReductions: Array<{
		id: string;
		title: string;
		oldRisk: number;
		newRisk: number;
		effort: number;
	}>;

	// Summary metrics
	totalEffortUnblocked: number;
	totalEffortSaved: number;
	totalRiskReduced: number;
}

export interface GraphSnapshot {
	timestamp: Date;
	completedNodes: Set<string>;
	totalRemainingEffort: number;
	readyEffort: number;
	blockedEffort: number;
}

export class RoadmapGraph {
	private nodes: Map<string, GraphNode> = new Map();
	private edges: GraphEdge[] = [];

	// Adjacency lists by edge type
	private outgoing: Map<string, GraphEdge[]> = new Map();
	private incoming: Map<string, GraphEdge[]> = new Map();

	// Parent-child relationships (from parentId)
	private children: Map<string, string[]> = new Map();

	// State management
	private completedNodes: Set<string> = new Set();
	private snapshots: GraphSnapshot[] = [];
	private descendantsCache: Record<string, string[]> = {};

	constructor(data: GraphData) {
		// Index nodes
		for (const node of data.nodes) {
			this.nodes.set(node.id, node);
			this.outgoing.set(node.id, []);
			this.incoming.set(node.id, []);
			this.children.set(node.id, []);

			// Initialize completed status from data
			if (node.status === "done") {
				this.completedNodes.add(node.id);
			}
		}

		// Index edges
		this.edges = data.edges;
		for (const edge of data.edges) {
			this.outgoing.get(edge.source)?.push(edge);
			this.incoming.get(edge.target)?.push(edge);
		}

		// Build parent-child index
		for (const node of data.nodes) {
			if (node.parentId) {
				this.children.get(node.parentId)?.push(node.id);
			}

			// Pre-compute descendants
			const optimizer = new GraphOptimizer();
			const cached = optimizer.loadOptimizedData();
			if (cached) {
				this.descendantsCache = cached.descendants;
			} else {
				this.descendantsCache = optimizer.computeDescendants(data.nodes);
				optimizer.saveOptimizedData(this.descendantsCache);
			}
		}
	}

	// ============================================
	// STATE MANAGEMENT
	// ============================================

	isCompleted(nodeId: string): boolean {
		return this.completedNodes.has(nodeId);
	}

	getCompletedNodes(): string[] {
		return [...this.completedNodes];
	}

	/**
	 * Mark a node as completed and return impact analysis
	 */
	markCompleted(nodeId: string): CompletionImpact {
		const node = this.nodes.get(nodeId);
		if (!node) {
			throw new Error(`Node not found: ${nodeId}`);
		}

		// Capture before state
		const beforeEfforts = new Map<string, number>();
		const beforeRisks = new Map<string, number>();
		for (const [id, _n] of this.nodes) {
			beforeEfforts.set(id, this.getEffectiveEffort(id));
			beforeRisks.set(id, this.getAdjustedRisk(id));
		}

		// Find nodes that were blocked by this one
		const wasDependedOnBy =
			this.incoming
				.get(nodeId)
				?.filter((e) => e.type === "DEPENDS_ON")
				.map((e) => e.source) ?? [];

		// Mark as completed
		this.completedNodes.add(nodeId);
		node.status = "done";

		// Find nodes now ready (all their dependencies completed)
		const nowReady: CompletionImpact["nowReady"] = [];
		for (const dependentId of wasDependedOnBy) {
			if (this.isReady(dependentId) && !this.isCompleted(dependentId)) {
				const depNode = this.nodes.get(dependentId);
				if (depNode) {
					nowReady.push({
						id: dependentId,
						title: depNode.title,
						effort: this.getEffectiveEffort(dependentId),
					});
				}
			}
		}

		// Find nodes with reduced effort due to FACILITATES edges
		const effortReductions: CompletionImpact["effortReductions"] = [];
		// Get outgoing FACILITATES edges - this completed node facilitates these targets
		const facilitatesEdges =
			this.outgoing.get(nodeId)?.filter((e) => e.type === "FACILITATES") ?? [];

		for (const edge of facilitatesEdges) {
			const targetId = edge.target;
			if (this.isCompleted(targetId)) continue;

			const targetNode = this.nodes.get(targetId);
			if (!targetNode) continue;

			const oldEffort = beforeEfforts.get(targetId) ?? 0;
			const newEffort = this.getEffectiveEffort(targetId);

			if (newEffort < oldEffort) {
				effortReductions.push({
					id: targetId,
					title: targetNode.title,
					oldEffort,
					newEffort,
					reason: edge.annotation,
				});
			}
		}

		// Find nodes with reduced risk due to DERISKS edges
		const riskReductions: CompletionImpact["riskReductions"] = [];
		// Get outgoing DERISKS edges - this completed node derisks these targets
		const derisksEdges =
			this.outgoing.get(nodeId)?.filter((e) => e.type === "DERISKS") ?? [];

		for (const edge of derisksEdges) {
			const targetId = edge.target;
			if (this.isCompleted(targetId)) continue;

			const targetNode = this.nodes.get(targetId);
			if (!targetNode) continue;

			const oldRisk = beforeRisks.get(targetId) ?? 0;
			const newRisk = this.getAdjustedRisk(targetId);

			if (newRisk < oldRisk - 0.01) {
				// Small epsilon for floating point
				riskReductions.push({
					id: targetId,
					title: targetNode.title,
					oldRisk,
					newRisk,
					effort: this.getEffectiveEffort(targetId),
				});
			}
		}

		// Calculate summary metrics
		const totalEffortUnblocked = nowReady.reduce((sum, n) => sum + n.effort, 0);
		const totalEffortSaved = effortReductions.reduce(
			(sum, r) => sum + (r.oldEffort - r.newEffort),
			0,
		);
		const totalRiskReduced = riskReductions.reduce(
			(sum, r) => sum + (r.oldRisk - r.newRisk) * r.effort,
			0,
		);

		return {
			nodeId,
			nodeTitle: node.title,
			nowReady,
			effortReductions,
			riskReductions,
			totalEffortUnblocked,
			totalEffortSaved,
			totalRiskReduced,
		};
	}

	/**
	 * Mark a node as not completed (undo)
	 */
	markIncomplete(nodeId: string): void {
		const node = this.nodes.get(nodeId);
		if (node) {
			this.completedNodes.delete(nodeId);
			node.status = "backlog";
		}
	}

	/**
	 * Get all dependencies for a node, including:
	 * 1. Direct DEPENDS_ON edges from this node
	 * 2. Inherited dependencies from parent chain
	 * 3. For hierarchical nodes (pillar/initiative/problem): dependencies from descendant nodes
	 *    that target nodes outside this subtree
	 *
	 * Returns the edges where this node (or its descendants) depends on the targets.
	 */
	private getAllDependencies(nodeId: string): GraphEdge[] {
		// Get OUTGOING DEPENDS_ON edges (this node depends on their targets)
		const directDeps =
			this.outgoing.get(nodeId)?.filter((e) => e.type === "DEPENDS_ON") ?? [];

		// Get inherited dependencies from parent chain
		const inheritedDeps: GraphEdge[] = [];
		let currentNode = this.nodes.get(nodeId);

		while (currentNode?.parentId) {
			const parentDeps =
				this.outgoing
					.get(currentNode.parentId)
					?.filter((e) => e.type === "DEPENDS_ON") ?? [];
			inheritedDeps.push(...parentDeps);
			currentNode = this.nodes.get(currentNode.parentId);
		}

		// For hierarchical nodes, aggregate dependencies from descendants
		// that cross outside this subtree
		const node = this.nodes.get(nodeId);
		const descendantDeps: GraphEdge[] = [];

		if (
			node &&
			(node.type === "pillar" ||
				node.type === "initiative" ||
				node.type === "problem")
		) {
			const descendants = this.getAllDescendants(nodeId);
			const descendantSet = new Set([nodeId, ...descendants]);

			// Look at all DEPENDS_ON edges from descendants
			for (const descId of descendants) {
				const descEdges =
					this.outgoing.get(descId)?.filter((e) => e.type === "DEPENDS_ON") ??
					[];

				for (const edge of descEdges) {
					// Find the ancestor of the target at the same level as this node
					const targetAncestor = this.findAncestorOfType(
						edge.target,
						node.type,
					);

					// Only count if the dependency crosses outside this subtree
					if (
						targetAncestor &&
						targetAncestor !== nodeId &&
						!descendantSet.has(edge.target)
					) {
						descendantDeps.push(edge);
					}
				}
			}
		}

		// Combine and deduplicate by target
		const allDeps = [...directDeps, ...inheritedDeps, ...descendantDeps];
		const uniqueDeps = new Map<string, GraphEdge>();
		for (const dep of allDeps) {
			uniqueDeps.set(dep.target, dep);
		}

		return Array.from(uniqueDeps.values());
	}

	/**
	 * Check if a node is ready (all dependencies completed, including inherited)
	 */
	isReady(nodeId: string): boolean {
		const deps = this.getAllDependencies(nodeId);
		return deps.every((e) => this.isCompleted(e.target));
	}

	/**
	 * Get effective effort considering completed FACILITATES edges.
	 * Base effort is reduced by compounding factors from completed facilitators.
	 * Formula: baseEffort × ∏(1 - factor) for all completed FACILITATES sources
	 */
	getEffectiveEffort(nodeId: string): number {
		const node = this.nodes.get(nodeId);
		if (!node) return 0;

		// If completed, effort is 0
		if (this.isCompleted(nodeId)) return 0;

		// Get base effort (only solutions have this)
		const baseEffort = node.baseEffort ?? 0;
		if (baseEffort === 0) return 0;

		// Find incoming FACILITATES edges from completed nodes
		const facilitators =
			this.incoming.get(nodeId)?.filter((e) => e.type === "FACILITATES") ?? [];

		// Apply compounding reduction: effort × (1-f1) × (1-f2) × ...
		let reductionMultiplier = 1.0;
		for (const edge of facilitators) {
			if (this.isCompleted(edge.source) && edge.factor) {
				reductionMultiplier *= 1 - edge.factor;
			}
		}

		return Math.round(baseEffort * reductionMultiplier);
	}

	/**
	 * Take a snapshot of current state
	 */
	takeSnapshot(): GraphSnapshot {
		let totalRemainingEffort = 0;
		let readyEffort = 0;
		let blockedEffort = 0;

		for (const [id, node] of this.nodes) {
			if (node.type !== "solution") continue;
			if (this.isCompleted(id)) continue;

			const effort = this.getEffectiveEffort(id);
			totalRemainingEffort += effort;

			if (this.isReady(id)) {
				readyEffort += effort;
			} else {
				blockedEffort += effort;
			}
		}

		const snapshot: GraphSnapshot = {
			timestamp: new Date(),
			completedNodes: new Set(this.completedNodes),
			totalRemainingEffort,
			readyEffort,
			blockedEffort,
		};

		this.snapshots.push(snapshot);
		return snapshot;
	}

	/**
	 * Preview impact of completing a node without actually completing it
	 */
	previewCompletion(nodeId: string): CompletionImpact {
		// Temporarily mark complete
		const wasCompleted = this.isCompleted(nodeId);
		if (!wasCompleted) {
			this.completedNodes.add(nodeId);
		}

		// Get impact
		const node = this.nodes.get(nodeId);

		// Find nodes that depend on this one
		const wasDependedOnBy =
			this.incoming
				.get(nodeId)
				?.filter((e) => e.type === "DEPENDS_ON")
				.map((e) => e.source) ?? [];

		const nowReady: CompletionImpact["nowReady"] = [];
		for (const dependentId of wasDependedOnBy) {
			if (this.isReady(dependentId) && !this.isCompleted(dependentId)) {
				const depNode = this.nodes.get(dependentId);
				if (depNode) {
					nowReady.push({
						id: dependentId,
						title: depNode.title,
						effort: this.getEffectiveEffort(dependentId),
					});
				}
			}
		}

		// Find effort reductions and risk reductions
		const effortReductions: CompletionImpact["effortReductions"] = [];
		const riskReductions: CompletionImpact["riskReductions"] = [];

		// Get outgoing FACILITATES edges - this node facilitates these targets
		const facilitatesEdges =
			this.outgoing.get(nodeId)?.filter((e) => e.type === "FACILITATES") ?? [];

		for (const edge of facilitatesEdges) {
			const targetId = edge.target;
			if (this.isCompleted(targetId)) continue;

			const targetNode = this.nodes.get(targetId);
			if (!targetNode) continue;

			// Calculate old effort (without this node completed)
			const oldEffort = this.getEffectiveEffort(targetId);

			// Calculate new effort (with this node completed)
			this.completedNodes.add(nodeId);
			const newEffort = this.getEffectiveEffort(targetId);
			this.completedNodes.delete(nodeId);

			if (newEffort < oldEffort) {
				effortReductions.push({
					id: targetId,
					title: targetNode.title,
					oldEffort,
					newEffort,
					reason: edge.annotation,
				});
			}
		}

		// Get outgoing DERISKS edges - this node derisks these targets
		const derisksEdges =
			this.outgoing.get(nodeId)?.filter((e) => e.type === "DERISKS") ?? [];

		for (const edge of derisksEdges) {
			const targetId = edge.target;
			if (this.isCompleted(targetId)) continue;

			const targetNode = this.nodes.get(targetId);
			if (!targetNode) continue;

			// Calculate old risk (without this node completed)
			const oldRisk = this.getAdjustedRisk(targetId);

			// Calculate new risk (with this node completed)
			this.completedNodes.add(nodeId);
			const newRisk = this.getAdjustedRisk(targetId);
			this.completedNodes.delete(nodeId);

			if (newRisk < oldRisk - 0.01) {
				riskReductions.push({
					id: targetId,
					title: targetNode.title,
					oldRisk,
					newRisk,
					effort: this.getEffectiveEffort(targetId),
				});
			}
		}

		// Restore original state
		if (wasCompleted) {
			this.completedNodes.add(nodeId);
		}

		const totalEffortUnblocked = nowReady.reduce((sum, n) => sum + n.effort, 0);
		const totalEffortSaved = effortReductions.reduce(
			(sum, r) => sum + (r.oldEffort - r.newEffort),
			0,
		);
		const totalRiskReduced = riskReductions.reduce(
			(sum, r) => sum + (r.oldRisk - r.newRisk) * r.effort,
			0,
		);

		return {
			nodeId,
			nodeTitle: node?.title ?? nodeId,
			nowReady,
			effortReductions,
			riskReductions,
			totalEffortUnblocked,
			totalEffortSaved,
			totalRiskReduced,
		};
	}

	// ============================================
	// BASIC METRICS
	// ============================================

	getInDegree(nodeId: string): number {
		return this.incoming.get(nodeId)?.length ?? 0;
	}

	getOutDegree(nodeId: string): number {
		return this.outgoing.get(nodeId)?.length ?? 0;
	}

	getDependsOnCount(nodeId: string): number {
		return this.getAllDependencies(nodeId).length;
	}

	/**
	 * Get count of nodes that depend on this node (i.e., how many nodes this blocks)
	 */
	getDependedOnByCount(nodeId: string): number {
		return (
			this.incoming.get(nodeId)?.filter((e) => e.type === "DEPENDS_ON")
				.length ?? 0
		);
	}

	/**
	 * Get all descendants (children, grandchildren, etc.) recursively
	 */
	private getAllDescendants(nodeId: string): string[] {
		return this.descendantsCache[nodeId] || [];
	}

	/**
	 * Get weighted blocking count: direct blocks + sum of all descendants of blocked nodes
	 * This captures that blocking a parent node means blocking all its children
	 */
	getWeightedBlockingCount(nodeId: string): number {
		const directlyBlocked =
			this.incoming
				.get(nodeId)
				?.filter((e) => e.type === "DEPENDS_ON")
				.map((e) => e.source) ?? [];

		let totalWeightedBlocks = 0;

		for (const blockedNodeId of directlyBlocked) {
			// Count the blocked node itself
			totalWeightedBlocks += 1;

			// Count all its descendants
			const descendants = this.getAllDescendants(blockedNodeId);
			totalWeightedBlocks += descendants.length;
		}

		return totalWeightedBlocks;
	}

	getFacilitatesCount(nodeId: string): number {
		return (
			this.outgoing.get(nodeId)?.filter((e) => e.type === "FACILITATES")
				.length ?? 0
		);
	}

	// ============================================
	// EFFORT CALCULATIONS
	// ============================================

	getDirectEffort(nodeId: string): number {
		return this.getEffectiveEffort(nodeId);
	}

	getTotalEffort(nodeId: string): number {
		const node = this.nodes.get(nodeId);
		if (!node) return 0;

		// If completed, effort is 0
		if (this.isCompleted(nodeId)) return 0;

		// If leaf node (solution), return effective effort
		if (node.type === "solution") {
			return this.getEffectiveEffort(nodeId);
		}

		// Sum children's efforts (only non-completed)
		const childIds = this.children.get(nodeId) ?? [];
		return childIds.reduce(
			(sum, childId) => sum + this.getTotalEffort(childId),
			0,
		);
	}

	// Get effort of all nodes that depend on this one (downstream effort)
	getDownstreamEffort(nodeId: string): number {
		const visited = new Set<string>();
		const queue = [nodeId];
		let totalEffort = 0;

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current || visited.has(current)) continue;
			visited.add(current);

			// Also check incoming edges where current is the target (nodes that depend on current)
			const dependentEdges =
				this.incoming.get(current)?.filter((e) => e.type === "DEPENDS_ON") ??
				[];

			for (const edge of dependentEdges) {
				// edge.source depends on edge.target (which is current)
				// so completing current unblocks edge.source
				if (!visited.has(edge.source)) {
					totalEffort += this.getTotalEffort(edge.source);
					queue.push(edge.source);
				}
			}
		}

		return totalEffort;
	}

	// ============================================
	// TOPOLOGICAL ANALYSIS
	// ============================================

	// Returns level in DAG (0 = no dependencies, higher = more blocked)
	computeTopologicalLevels(): Map<string, number> {
		const levels = new Map<string, number>();
		const dependencyEdges = this.edges.filter((e) => e.type === "DEPENDS_ON");

		// Build dependency graph
		const deps = new Map<string, Set<string>>();
		for (const node of this.nodes.values()) {
			deps.set(node.id, new Set());
		}
		for (const edge of dependencyEdges) {
			deps.get(edge.source)?.add(edge.target);
		}

		// Compute levels using BFS
		const computed = new Set<string>();
		let currentLevel = 0;

		while (computed.size < this.nodes.size) {
			const thisLevel: string[] = [];

			for (const [nodeId, nodeDeps] of deps) {
				if (computed.has(nodeId)) continue;

				// Check if all dependencies are computed
				const allDepsComputed = [...nodeDeps].every((d) => computed.has(d));
				if (allDepsComputed || nodeDeps.size === 0) {
					thisLevel.push(nodeId);
					levels.set(nodeId, currentLevel);
				}
			}

			// If no progress, there's a cycle - assign remaining to max level
			if (thisLevel.length === 0) {
				for (const nodeId of this.nodes.keys()) {
					if (!computed.has(nodeId)) {
						levels.set(nodeId, currentLevel);
						computed.add(nodeId);
					}
				}
				break;
			}

			for (const nodeId of thisLevel) {
				computed.add(nodeId);
			}
			currentLevel++;
		}

		return levels;
	}

	// ============================================
	// INFLUENCE / PAGERANK-STYLE SCORING
	// ============================================

	// Run PageRank on the transpose of DEPENDS_ON graph
	// High score = completing this node enables lots of important work
	computeInfluenceScores(
		iterations: number = 20,
		damping: number = 0.85,
	): Map<string, number> {
		const scores = new Map<string, number>();
		const nodeIds = [...this.nodes.keys()];
		const n = nodeIds.length;

		// Initialize with equal scores
		for (const nodeId of nodeIds) {
			scores.set(nodeId, 1 / n);
		}

		// Build transpose of dependency graph
		// If A DEPENDS_ON B, then B influences A
		// So in transpose: B → A (B's score flows to A... no wait, we want reverse)
		// Actually for "what does completing B enable", we want:
		// edges where B is TARGET of DEPENDS_ON, the sources are what B enables

		const enablesMap = new Map<string, string[]>();
		for (const nodeId of nodeIds) {
			enablesMap.set(nodeId, []);
		}

		for (const edge of this.edges) {
			if (edge.type === "DEPENDS_ON") {
				// edge.source depends on edge.target
				// So completing edge.target enables edge.source
				enablesMap.get(edge.target)?.push(edge.source);
			}
			if (edge.type === "FACILITATES") {
				// edge.source facilitates edge.target (softer relationship)
				enablesMap.get(edge.source)?.push(edge.target);
			}
		}

		// PageRank iterations
		for (let i = 0; i < iterations; i++) {
			const newScores = new Map<string, number>();

			for (const nodeId of nodeIds) {
				let score = (1 - damping) / n;

				// Find nodes that this node enables
				// Score flows FROM nodes we depend on TO us
				const incomingDeps =
					this.incoming.get(nodeId)?.filter((e) => e.type === "DEPENDS_ON") ??
					[];

				for (const edge of incomingDeps) {
					const sourceScore = scores.get(edge.target) ?? 0;
					const sourceOutDegree = enablesMap.get(edge.target)?.length ?? 1;
					score += damping * (sourceScore / Math.max(sourceOutDegree, 1));
				}

				newScores.set(nodeId, score);
			}

			// Update scores
			for (const [nodeId, score] of newScores) {
				scores.set(nodeId, score);
			}
		}

		// Normalize
		const maxScore = Math.max(...scores.values());
		if (maxScore > 0) {
			for (const [nodeId, score] of scores) {
				scores.set(nodeId, score / maxScore);
			}
		}

		return scores;
	}

	// ============================================
	// READINESS SCORING
	// ============================================

	// Readiness based on completed dependencies
	// 1.0 = all dependencies completed (ready to start)
	// 0.5 = has unmet dependencies (blocked)
	// 0.0 = completed (no longer needs work)
	computeReadiness(nodeId: string): number {
		if (this.isCompleted(nodeId)) return 0;

		const deps =
			this.incoming.get(nodeId)?.filter((e) => e.type === "DEPENDS_ON") ?? [];

		if (deps.length === 0) return 1;

		const unmetDeps = deps.filter((e) => !this.isCompleted(e.target)).length;
		return 1 / (unmetDeps + 1);
	}

	// ============================================
	// LEVERAGE SCORING
	// ============================================

	// Leverage = downstream_effort / own_effort
	// High leverage = completing this unlocks lots of work relative to its cost
	computeLeverage(nodeId: string): number {
		const ownEffort = this.getTotalEffort(nodeId);
		const downstreamEffort = this.getDownstreamEffort(nodeId);

		if (ownEffort === 0) return 0;
		return downstreamEffort / ownEffort;
	}

	// ============================================
	// UNCERTAINTY SCORING
	// ============================================

	getBaseUncertainty(nodeId: string): number {
		const node = this.nodes.get(nodeId);
		return node?.baseUncertainty ?? 0.0; // Default: no uncertainty
	}

	/**
	 * Get adjusted uncertainty considering completed INFORMS edges.
	 * Uncertainty is reduced by compounding factors from completed informers.
	 * Formula: baseUncertainty × ∏(1 - factor) for all completed INFORMS sources
	 */
	getAdjustedUncertainty(nodeId: string): number {
		const baseUncertainty = this.getBaseUncertainty(nodeId);
		if (baseUncertainty === 0) return 0;

		// Find incoming INFORMS edges from completed nodes
		const informers =
			this.incoming.get(nodeId)?.filter((e) => e.type === "INFORMS") ?? [];

		if (informers.length === 0) return baseUncertainty;

		// Apply compounding reduction: uncertainty × (1-f1) × (1-f2) × ...
		let reductionMultiplier = 1.0;
		for (const edge of informers) {
			if (this.isCompleted(edge.source) && edge.factor) {
				reductionMultiplier *= 1 - edge.factor;
			}
		}

		return baseUncertainty * reductionMultiplier;
	}

	/**
	 * Get adjusted effort including uncertainty overhead.
	 * Formula: effectiveEffort × (1 + adjustedUncertainty)
	 * Uncertainty adds overhead (1.0 = 0% overhead, 0.5 = 50% overhead)
	 */
	getAdjustedEffort(nodeId: string): number {
		return (
			this.getEffectiveEffort(nodeId) *
			(1 + this.getAdjustedUncertainty(nodeId))
		);
	}

	// ============================================
	// RISK SCORING
	// ============================================

	getBaseRisk(nodeId: string): number {
		const node = this.nodes.get(nodeId);
		return node?.baseRisk ?? 0.0; // Default: no risk
	}

	/**
	 * Get adjusted risk considering completed DERISKS edges.
	 *
	 * Edge semantics: source DERISKS target
	 * - source = the derisking action (completing this reduces target's risk)
	 * - target = the risky node
	 *
	 * Risk = baseRisk × product of (1 - factor) for each completed derisker
	 */
	getAdjustedRisk(nodeId: string): number {
		const baseRisk = this.getBaseRisk(nodeId);
		if (baseRisk === 0) return 0;

		// Find incoming DERISKS edges from completed nodes
		const deriskers =
			this.incoming.get(nodeId)?.filter((e) => e.type === "DERISKS") ?? [];

		if (deriskers.length === 0) return baseRisk;

		// Apply compounding reduction: risk × (1-f1) × (1-f2) × ...
		let reductionMultiplier = 1.0;
		for (const edge of deriskers) {
			if (this.isCompleted(edge.source) && edge.factor) {
				reductionMultiplier *= 1 - edge.factor;
			}
		}

		return baseRisk * reductionMultiplier;
	}

	/**
	 * Get the safety factor (1 - adjustedRisk).
	 * Higher = safer to execute this task now.
	 */
	getSafetyFactor(nodeId: string): number {
		return 1 - this.getAdjustedRisk(nodeId);
	}

	/**
	 * Compute how much "risky work" becomes safer if this node is completed.
	 *
	 * Edge semantics: source DERISKS target
	 * - We look for edges where THIS node is the SOURCE (the derisker)
	 * - The TARGET of those edges is the risky work that becomes safer
	 *
	 * RiskMitigationValue = Σ (factor × baseEffort × currentRisk) for each derisked node
	 */
	computeRiskMitigationValue(nodeId: string): number {
		// Find all DERISKS edges where this node is the SOURCE (derisker)
		// The TARGET of these edges are the risky tasks that would become safer
		const deriskedEdges =
			this.outgoing.get(nodeId)?.filter((e) => e.type === "DERISKS") ?? [];

		if (deriskedEdges.length === 0) return 0;

		let totalValue = 0;

		for (const edge of deriskedEdges) {
			const riskyNodeId = edge.target;

			if (this.isCompleted(riskyNodeId)) continue; // Risky task already done
			if (this.isCompleted(nodeId)) continue; // Already derisking

			const riskyNode = this.nodes.get(riskyNodeId);
			if (!riskyNode) continue;

			const riskyEffort = this.getEffectiveEffort(riskyNodeId);
			const riskyCurrentRisk = this.getAdjustedRisk(riskyNodeId);
			const factor = edge.factor ?? 0.0;

			// Value = how much risk × effort is being reduced
			totalValue += factor * riskyEffort * riskyCurrentRisk;
		}

		return totalValue;
	}

	/**
	 * Get risky effort: sum of effort × risk for all incomplete solutions
	 */
	getTotalRiskyEffort(): number {
		let total = 0;
		for (const [id, node] of this.nodes) {
			if (node.type !== "solution") continue;
			if (this.isCompleted(id)) continue;

			total += this.getEffectiveEffort(id) * this.getAdjustedRisk(id);
		}
		return total;
	}

	// ============================================
	// COMBINED PRIORITY SCORING (Risk-Averse)
	// ============================================

	/**
	 * Priority formula with weighted factors (additive, not multiplicative).
	 *
	 * Priority = Σ(weight_i × factor_i) + riskMitigationBonus
	 *
	 * Factors (all normalized 0-1):
	 * - readiness: Can we start this now? (1.0 = yes, 0 = fully blocked)
	 * - influence: How central is this in the dependency graph?
	 * - leverage: How much downstream work does this unblock? (normalized)
	 * - safetyFactor: (1 - adjustedRisk) - higher for safer tasks
	 * - blockingScore: Normalized weighted blocking count
	 * - riskMitigationBonus: Extra priority for tasks that reduce risk for others
	 *
	 * Default weights balance immediate value with strategic impact:
	 * - readiness: 30% - Can we start now?
	 * - influence: 15% - Graph centrality
	 * - leverage: 20% - Downstream unblocking
	 * - safetyFactor: 15% - Risk avoidance
	 * - blockingScore: 20% - How much work depends on this
	 */
	computePriorityScore(
		nodeId: string,
		influenceScores: Map<string, number>,
		weights: {
			readiness?: number;
			influence?: number;
			leverage?: number;
			safetyFactor?: number;
			blockingScore?: number;
			riskMitigationBonus?: number;
		} = {},
	): number {
		// Default weights (should sum to 100%)
		const w = {
			readiness: weights.readiness ?? 0.3,
			influence: weights.influence ?? 0.15,
			leverage: weights.leverage ?? 0.2,
			safetyFactor: weights.safetyFactor ?? 0.15,
			blockingScore: weights.blockingScore ?? 0.2,
			riskMitigationBonus: weights.riskMitigationBonus ?? 0.5,
		};

		// Raw factors
		const readiness = this.computeReadiness(nodeId);
		const influence = influenceScores.get(nodeId) ?? 0;
		const rawLeverage = this.computeLeverage(nodeId);
		const safetyFactor = this.getSafetyFactor(nodeId);
		const weightedBlocking = this.getWeightedBlockingCount(nodeId);
		const riskMitigationValue = this.computeRiskMitigationValue(nodeId);

		// Normalize leverage to 0-1 range using log scale
		// Most leverage values are 0-10, so log(1 + leverage) / log(11) normalizes to ~0-1
		const leverage = Math.min(1, Math.log(1 + rawLeverage) / Math.log(11));

		// Normalize blocking score to 0-1 range using log scale
		// Typical weighted blocking is 0-50, so log(1 + blocking) / log(51) normalizes to ~0-1
		const blockingScore = Math.min(
			1,
			Math.log(1 + weightedBlocking) / Math.log(51),
		);

		// Weighted sum (all factors 0-1, weights sum to 1.0)
		const baseScore =
			w.readiness * readiness +
			w.influence * influence +
			w.leverage * leverage +
			w.safetyFactor * safetyFactor +
			w.blockingScore * blockingScore;

		// Risk mitigation bonus (additive, normalized by effort)
		const effort = this.getEffectiveEffort(nodeId);
		const mitigationBonus =
			effort > 0 ? (riskMitigationValue / effort) * w.riskMitigationBonus : 0;

		return baseScore + mitigationBonus;
	}

	// ============================================
	// COMPUTE ALL METRICS
	// ============================================

	computeAllMetrics(): NodeMetrics[] {
		const topoLevels = this.computeTopologicalLevels();
		const influenceScores = this.computeInfluenceScores();

		const metrics: NodeMetrics[] = [];

		for (const [nodeId, node] of this.nodes) {
			const directEffort = this.getDirectEffort(nodeId);
			const uncertainty = this.getAdjustedUncertainty(nodeId);
			const baseRisk = this.getBaseRisk(nodeId);
			const adjustedRisk = this.getAdjustedRisk(nodeId);

			// Compute cross-cutting edges for hierarchical nodes (pillar, initiative, problem)
			const crossCuttingEdges =
				node.type === "pillar" ||
				node.type === "initiative" ||
				node.type === "problem"
					? this.getCrossCuttingEdges(nodeId)
					: undefined;

			metrics.push({
				id: nodeId,
				title: node.title,
				type: node.type,
				inDegree: this.getInDegree(nodeId),
				outDegree: this.getOutDegree(nodeId),
				dependsOnCount: this.getDependsOnCount(nodeId),
				dependedOnByCount: this.getDependedOnByCount(nodeId),
				weightedBlockingCount: this.getWeightedBlockingCount(nodeId),
				facilitatesCount: this.getFacilitatesCount(nodeId),
				directEffort,
				totalEffort: this.getTotalEffort(nodeId),
				uncertainty,
				adjustedEffort: directEffort * uncertainty,
				baseRisk,
				adjustedRisk,
				riskMitigationValue: this.computeRiskMitigationValue(nodeId),
				readiness: this.computeReadiness(nodeId),
				leverage: this.computeLeverage(nodeId),
				safetyFactor: this.getSafetyFactor(nodeId),
				priorityScore: this.computePriorityScore(nodeId, influenceScores),
				topoLevel: topoLevels.get(nodeId) ?? 0,
				influenceScore: influenceScores.get(nodeId) ?? 0,
				crossCuttingEdges,
			});
		}

		return metrics;
	}

	// ============================================
	// CLUSTER DETECTION (Louvain-simplified)
	// ============================================

	// Simple connected components based on RELATES_TO edges
	findClusters(): Map<string, string[]> {
		const clusters = new Map<string, string[]>();
		const visited = new Set<string>();

		// Build undirected graph from RELATES_TO edges
		const neighbors = new Map<string, Set<string>>();
		for (const nodeId of this.nodes.keys()) {
			neighbors.set(nodeId, new Set());
		}

		for (const edge of this.edges) {
			if (edge.type === "RELATES_TO") {
				neighbors.get(edge.source)?.add(edge.target);
				neighbors.get(edge.target)?.add(edge.source);
			}
		}

		let clusterIndex = 0;
		for (const nodeId of this.nodes.keys()) {
			if (visited.has(nodeId)) continue;

			// BFS to find connected component
			const queue = [nodeId];
			const cluster: string[] = [];

			while (queue.length > 0) {
				const current = queue.shift();
				if (!current || visited.has(current)) continue;
				visited.add(current);
				cluster.push(current);

				for (const neighbor of neighbors.get(current) ?? []) {
					if (!visited.has(neighbor)) {
						queue.push(neighbor);
					}
				}
			}

			if (cluster.length > 1) {
				clusters.set(`cluster-${clusterIndex}`, cluster);
				clusterIndex++;
			}
		}

		return clusters;
	}

	// ============================================
	// CRITICAL PATH ANALYSIS
	// ============================================

	// Find the longest path through DEPENDS_ON edges (weighted by effort)
	findCriticalPath(): { path: string[]; totalEffort: number } {
		const topoLevels = this.computeTopologicalLevels();

		// Sort nodes by topological level
		const sortedNodes = [...this.nodes.keys()].sort(
			(a, b) => (topoLevels.get(a) ?? 0) - (topoLevels.get(b) ?? 0),
		);

		// DP: longest path to each node
		const dist = new Map<string, number>();
		const prev = new Map<string, string | null>();

		for (const nodeId of sortedNodes) {
			dist.set(nodeId, this.getTotalEffort(nodeId));
			prev.set(nodeId, null);
		}

		for (const nodeId of sortedNodes) {
			const currentDist = dist.get(nodeId) ?? 0;

			// Find nodes that depend on this one
			const dependentEdges =
				this.incoming.get(nodeId)?.filter((e) => e.type === "DEPENDS_ON") ?? [];

			for (const edge of dependentEdges) {
				const dependentEffort = this.getTotalEffort(edge.source);
				const newDist = currentDist + dependentEffort;

				if (newDist > (dist.get(edge.source) ?? 0)) {
					dist.set(edge.source, newDist);
					prev.set(edge.source, nodeId);
				}
			}
		}

		// Find the node with maximum distance
		let maxNode = sortedNodes[0];
		let maxDist = 0;
		for (const [nodeId, d] of dist) {
			if (d > maxDist) {
				maxDist = d;
				maxNode = nodeId;
			}
		}

		// Reconstruct path
		const path: string[] = [];
		let current: string | null = maxNode;
		while (current) {
			path.push(current);
			current = prev.get(current) ?? null;
		}

		return { path: path.reverse(), totalEffort: maxDist };
	}

	// ============================================
	// CYCLE DETECTION
	// ============================================

	findCycles(): string[][] {
		const cycles: string[][] = [];
		const visited = new Set<string>();
		const recStack = new Set<string>();
		const path: string[] = [];

		const dfs = (nodeId: string): boolean => {
			visited.add(nodeId);
			recStack.add(nodeId);
			path.push(nodeId);

			const outEdges =
				this.outgoing.get(nodeId)?.filter((e) => e.type === "DEPENDS_ON") ?? [];

			for (const edge of outEdges) {
				if (!visited.has(edge.target)) {
					if (dfs(edge.target)) return true;
				} else if (recStack.has(edge.target)) {
					// Found cycle
					const cycleStart = path.indexOf(edge.target);
					cycles.push([...path.slice(cycleStart), edge.target]);
				}
			}

			path.pop();
			recStack.delete(nodeId);
			return false;
		};

		for (const nodeId of this.nodes.keys()) {
			if (!visited.has(nodeId)) {
				dfs(nodeId);
			}
		}

		return cycles;
	}

	// ============================================
	// ACCESSORS
	// ============================================

	getNode(id: string): GraphNode | undefined {
		return this.nodes.get(id);
	}

	getAllNodes(): GraphNode[] {
		return [...this.nodes.values()];
	}

	getNodesByType(type: string): GraphNode[] {
		return [...this.nodes.values()].filter((n) => n.type === type);
	}

	// ============================================
	// DERIVED EDGES (Cross-cutting Relationships)
	// ============================================

	/**
	 * Compute derived edges for parent nodes based on their children's connections.
	 *
	 * For each parent node at a given level, aggregate edges from its children
	 * that connect to nodes under DIFFERENT parents.
	 *
	 * Returns edges grouped by type, then aggregated into weighted connections.
	 */
	computeDerivedEdges(nodeType: NodeType): DerivedEdge[] {
		const derivedEdges: DerivedEdge[] = [];
		const parentNodes = this.getNodesByType(nodeType);

		// For each parent node
		for (const parent of parentNodes) {
			// Get all descendants (children at all levels)
			const descendants = this.getAllDescendants(parent.id);

			// Track edges by (targetParent, edgeType) -> contributing child edges
			const edgeGroups = new Map<
				string,
				{
					targetParentId: string;
					type: EdgeType;
					childEdgeIds: string[];
				}
			>();

			// Examine all edges from descendants
			for (const descendantId of descendants) {
				const outgoingEdges = this.outgoing.get(descendantId) ?? [];

				for (const edge of outgoingEdges) {
					const targetNode = this.nodes.get(edge.target);
					if (!targetNode) continue;

					// Find the target's ancestor at the same level as parent
					const targetParent = this.findAncestorOfType(edge.target, nodeType);
					if (!targetParent) continue;

					// Only create derived edge if it crosses to a DIFFERENT parent branch
					if (targetParent === parent.id) continue;

					// Group by (targetParent, edgeType)
					const key = `${targetParent}:${edge.type}`;
					if (!edgeGroups.has(key)) {
						edgeGroups.set(key, {
							targetParentId: targetParent,
							type: edge.type,
							childEdgeIds: [],
						});
					}
					edgeGroups.get(key)?.childEdgeIds.push(edge.id);
				}
			}

			// Create derived edges from groups
			for (const group of edgeGroups.values()) {
				derivedEdges.push({
					source: parent.id,
					target: group.targetParentId,
					type: group.type,
					weight: group.childEdgeIds.length,
					childEdges: group.childEdgeIds,
				});
			}
		}

		return derivedEdges;
	}

	/**
	 * Find the ancestor of a node that matches the given type.
	 * Returns the ancestor's ID or null if not found.
	 */
	private findAncestorOfType(
		nodeId: string,
		ancestorType: NodeType,
	): string | null {
		let current = this.nodes.get(nodeId);

		while (current) {
			if (current.type === ancestorType) {
				return current.id;
			}
			if (!current.parentId) break;
			current = this.nodes.get(current.parentId);
		}

		return null;
	}

	/**
	 * Get aggregated cross-cutting edges for a specific node.
	 * Useful for understanding a single pillar/initiative's external relationships.
	 */
	getCrossCuttingEdges(nodeId: string): DerivedEdge[] {
		const node = this.nodes.get(nodeId);
		if (!node) return [];

		const allDerived = this.computeDerivedEdges(node.type as NodeType);
		return allDerived.filter((e) => e.source === nodeId || e.target === nodeId);
	}

	/**
	 * Create a weighted summary edge by combining all edge types.
	 * Used for high-level visualization showing total cross-cutting impact.
	 */
	aggregateDerivedEdges(derivedEdges: DerivedEdge[]): Map<
		string,
		{
			source: string;
			target: string;
			totalWeight: number;
			byType: Map<EdgeType, number>;
		}
	> {
		const aggregated = new Map<
			string,
			{
				source: string;
				target: string;
				totalWeight: number;
				byType: Map<EdgeType, number>;
			}
		>();

		for (const edge of derivedEdges) {
			const key = `${edge.source}->${edge.target}`;

			if (!aggregated.has(key)) {
				aggregated.set(key, {
					source: edge.source,
					target: edge.target,
					totalWeight: 0,
					byType: new Map(),
				});
			}

			const agg = aggregated.get(key);
			if (agg) {
				agg.totalWeight += edge.weight;
				agg.byType.set(
					edge.type,
					(agg.byType.get(edge.type) ?? 0) + edge.weight,
				);
			}
		}

		return aggregated;
	}
}
