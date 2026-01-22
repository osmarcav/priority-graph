import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { CompletionImpact, GraphSnapshot } from "./graph";
import { RoadmapGraph } from "./graph";
import { ReportGenerator } from "./reportGenerator";
import { formatNumber, printSimpleTable, printTable } from "./tableFormatter";
import type { GraphData, NodeMetrics } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// ANALYSIS OUTPUTS
// ============================================

function printSummary(graph: RoadmapGraph, data: GraphData) {
	const nodesByType = {
		pillar: graph.getNodesByType("pillar").length,
		initiative: graph.getNodesByType("initiative").length,
		problem: graph.getNodesByType("problem").length,
		solution: graph.getNodesByType("solution").length,
	};

	const edgesByType: Record<string, number> = {};
	for (const edge of data.edges) {
		edgesByType[edge.type] = (edgesByType[edge.type] ?? 0) + 1;
	}

	// Calculate risk metrics
	const solutions = data.nodes.filter((n) => n.type === "solution");
	const totalEffort = solutions.reduce(
		(sum, n) => sum + (n.baseEffort ?? 0),
		0,
	);
	const riskyNodes = solutions.filter((n) => (n.baseRisk ?? 0) >= 0.5);
	const riskyEffort = riskyNodes.reduce(
		(sum, n) => sum + (n.baseEffort ?? 0),
		0,
	);
	const avgRisk =
		solutions.reduce((sum, n) => sum + (n.baseRisk ?? 0), 0) / solutions.length;

	console.log(`\n${"═".repeat(60)}`);
	console.log("  GRAPH SUMMARY");
	console.log("═".repeat(60));
	console.log(`  Nodes: ${data.nodes.length}`);
	console.log(`    - Pillars:     ${nodesByType.pillar}`);
	console.log(`    - Initiatives: ${nodesByType.initiative}`);
	console.log(`    - Problems:    ${nodesByType.problem}`);
	console.log(`    - Solutions:   ${nodesByType.solution}`);
	console.log(`  Edges: ${data.edges.length}`);
	for (const [type, count] of Object.entries(edgesByType)) {
		console.log(`    - ${type}: ${count}`);
	}
	console.log("");
	console.log(`  Total Effort: ${totalEffort} points`);
	console.log(`  Risk Profile:`);
	console.log(
		`    - High-risk solutions (≥0.5): ${riskyNodes.length} (${riskyEffort} effort points)`,
	);
	console.log(`    - Average risk: ${formatNumber(avgRisk, 2)}`);
	console.log(
		`    - Risky effort ratio: ${formatNumber((riskyEffort / totalEffort) * 100, 1)}%`,
	);
}

function printTopPrioritySolutions(metrics: NodeMetrics[], limit: number = 15) {
	const solutions = metrics
		.filter((m) => m.type === "solution")
		.sort((a, b) => b.priorityScore - a.priorityScore)
		.slice(0, limit);

	const headers = [
		"#",
		"Title",
		"Effort",
		"Risk",
		"Safe",
		"RskMit",
		"Priority",
	];
	const colWidths = [3, 45, 8, 6, 6, 8, 10];

	const rows = solutions.map((m, i) => [
		String(i + 1),
		m.title,
		String(m.directEffort),
		formatNumber(m.adjustedRisk, 1),
		formatNumber(m.safetyFactor, 1),
		formatNumber(m.riskMitigationValue, 1),
		formatNumber(m.priorityScore, 4),
	]);

	printTable(
		"TOP PRIORITY SOLUTIONS (weighted scoring)",
		headers,
		rows,
		colWidths,
	);

	console.log("\n  Priority formula: Weighted sum (0-1 scale)");
	console.log("    • Readiness (30%): Can we start now?");
	console.log("    • Influence (15%): Graph centrality");
	console.log("    • Leverage (20%): Downstream unblocking");
	console.log("    • Safety (15%): Risk avoidance (1 - risk)");
	console.log("    • Blocking (20%): How much work depends on this");
	console.log(
		"    • Risk mitigation bonus (additive): Makes other work safer\n",
	);
}

function printRiskySolutions(metrics: NodeMetrics[], limit: number = 15) {
	const solutions = metrics
		.filter((m) => m.type === "solution" && m.baseRisk > 0.3)
		.sort((a, b) => b.adjustedRisk - a.adjustedRisk)
		.slice(0, limit);

	const headers = [
		"Title",
		"Effort",
		"Base",
		"Adj",
		"Safety",
		"Mitigators Needed",
	];
	const colWidths = [40, 8, 6, 5, 8, 30];

	const rows = solutions.map((m) => {
		const riskReduced = m.baseRisk - m.adjustedRisk;
		const status =
			riskReduced > 0.1
				? `↓${formatNumber(riskReduced, 2)} mitigated`
				: "needs mitigators";
		return [
			m.title,
			String(m.directEffort),
			formatNumber(m.baseRisk, 2),
			formatNumber(m.adjustedRisk, 2),
			formatNumber(m.safetyFactor, 2),
			status,
		];
	});

	printTable(
		"⚠️  RISKY SOLUTIONS (high risk of rework/failure)",
		headers,
		rows,
		colWidths,
	);
}

function printRiskMitigators(metrics: NodeMetrics[], limit: number = 15) {
	const mitigators = metrics
		.filter((m) => m.type === "solution" && m.riskMitigationValue > 0)
		.sort((a, b) => b.riskMitigationValue - a.riskMitigationValue)
		.slice(0, limit);

	const headers = ["Title", "Effort", "Risk", "Mitigation Value", "Leverage"];
	const colWidths = [45, 8, 6, 17, 10];

	const rows = mitigators.map((m) => [
		m.title,
		String(m.directEffort),
		formatNumber(m.adjustedRisk, 2),
		formatNumber(m.riskMitigationValue, 2),
		formatNumber(m.leverage, 2),
	]);

	printTable(
		"🛡️  RISK MITIGATORS (completing these makes other work safer)",
		headers,
		rows,
		colWidths,
	);
}

function printReadySolutions(metrics: NodeMetrics[], limit: number = 15) {
	const solutions = metrics
		.filter((m) => m.type === "solution" && m.dependsOnCount === 0)
		.sort((a, b) => b.influenceScore - a.influenceScore)
		.slice(0, limit);

	const headers = ["Title", "Effort", "Influence", "Facilitates", "Level"];
	const colWidths = [55, 8, 11, 13, 7];

	const rows = solutions.map((m) => [
		m.title,
		String(m.directEffort),
		formatNumber(m.influenceScore, 3),
		String(m.facilitatesCount),
		String(m.topoLevel),
	]);

	printTable(
		"READY TO START (no dependencies, sorted by influence)",
		headers,
		rows,
		colWidths,
	);
}

function printHighLeverageSolutions(
	metrics: NodeMetrics[],
	limit: number = 15,
) {
	const solutions = metrics
		.filter((m) => m.type === "solution" && m.leverage > 0)
		.sort((a, b) => b.leverage - a.leverage)
		.slice(0, limit);

	const headers = ["Title", "Effort", "Downstream", "Leverage", "Deps"];
	const colWidths = [55, 8, 12, 10, 6];

	const rows = solutions.map((m) => [
		m.title,
		String(m.directEffort),
		String(Math.round(m.leverage * m.directEffort)),
		formatNumber(m.leverage, 2),
		String(m.dependsOnCount),
	]);

	printTable(
		"HIGH LEVERAGE SOLUTIONS (most downstream impact per effort)",
		headers,
		rows,
		colWidths,
	);
}

function printBlockedSolutions(metrics: NodeMetrics[], limit: number = 15) {
	const solutions = metrics
		.filter((m) => m.type === "solution" && m.dependsOnCount > 0)
		.sort((a, b) => b.dependsOnCount - a.dependsOnCount)
		.slice(0, limit);

	const headers = ["Title", "Effort", "Blockers", "Level", "Influence"];
	const colWidths = [55, 8, 10, 7, 11];

	const rows = solutions.map((m) => [
		m.title,
		String(m.directEffort),
		String(m.dependsOnCount),
		String(m.topoLevel),
		formatNumber(m.influenceScore, 3),
	]);

	printTable("BLOCKED SOLUTIONS (most dependencies)", headers, rows, colWidths);
}

function printInitiativeSummary(_graph: RoadmapGraph, metrics: NodeMetrics[]) {
	const initiatives = metrics.filter((m) => m.type === "initiative");

	// Sort by total effort descending
	initiatives.sort((a, b) => b.totalEffort - a.totalEffort);

	console.log(`\n${"═".repeat(110)}`);
	console.log("  INITIATIVE SUMMARY");
	console.log("═".repeat(110));

	const headers = [
		"Initiative",
		"Effort",
		"Blocks",
		"Deps",
		"Facilitates",
		"Level",
		"Cross-Pillar",
	];
	const colWidths = [38, 8, 8, 6, 13, 7, 30];

	const rows = initiatives.map((m) => {
		const crossCutting = m.crossCuttingEdges ?? [];
		const toPillars = new Set(
			crossCutting.map((e) => (e.source === m.id ? e.target : e.source)),
		);

		const summary =
			toPillars.size > 0
				? `${toPillars.size} pillars (${crossCutting.reduce((sum, e) => sum + e.weight, 0)} links)`
				: "—";

		return [
			m.title,
			String(m.totalEffort),
			String(m.dependedOnByCount),
			String(m.dependsOnCount),
			String(m.facilitatesCount),
			String(m.topoLevel),
			summary,
		];
	});

	printTable("", headers, rows, colWidths);
}

function printInitiativePriorityRanking(
	_graph: RoadmapGraph,
	metrics: NodeMetrics[],
	limit: number = 15,
) {
	const initiatives = metrics.filter((m) => m.type === "initiative");

	// Sort by: blocks (DESC), then deps (ASC), then effort (ASC)
	// Initiatives that unblock most work, have fewest dependencies, and lowest effort get priority
	initiatives.sort((a, b) => {
		// Primary: more weighted blocks = higher priority
		if (b.weightedBlockingCount !== a.weightedBlockingCount) {
			return b.weightedBlockingCount - a.weightedBlockingCount;
		}
		// Secondary: fewer dependencies = higher priority
		if (a.dependsOnCount !== b.dependsOnCount) {
			return a.dependsOnCount - b.dependsOnCount;
		}
		// Tertiary: lower effort = higher priority (easier wins)
		return a.totalEffort - b.totalEffort;
	});

	const headers = [
		"#",
		"Initiative",
		"Effort",
		"Weighted Blocks",
		"Deps",
		"Ready",
	];
	const colWidths = [3, 50, 8, 16, 6, 7];

	const rows = initiatives.slice(0, limit).map((m, i) => {
		const readyStatus = m.dependsOnCount === 0 ? "✓" : `${m.dependsOnCount}`;
		return [
			String(i + 1),
			m.title,
			String(m.totalEffort),
			String(m.weightedBlockingCount),
			String(m.dependsOnCount),
			readyStatus,
		];
	});

	printTable(
		"🎯 INITIATIVE PRIORITY RANKING (by blocking impact)",
		headers,
		rows,
		colWidths,
	);

	// Show explanation
	console.log("\n  Ranking logic:");
	console.log(
		"  1. Primary: Weighted blocking count (higher = blocks more work including descendants)",
	);
	console.log(
		"  2. Secondary: Dependency count (lower = fewer blockers, ready sooner)",
	);
	console.log("  3. Tertiary: Total effort (lower = easier quick wins)");
	console.log(
		"  → Prioritize initiatives that unblock most work with fewest dependencies and lowest effort\n",
	);
}

function printPillarSummary(graph: RoadmapGraph, metrics: NodeMetrics[]) {
	const pillars = metrics.filter((m) => m.type === "pillar");

	// Sort by total effort descending
	pillars.sort((a, b) => b.totalEffort - a.totalEffort);

	console.log(`\n${"═".repeat(100)}`);
	console.log("  STRATEGIC PILLAR SUMMARY");
	console.log("═".repeat(100));

	const headers = [
		"Strategic Pillar",
		"Total Effort",
		"Out-Degree",
		"In-Degree",
		"Cross-Cutting",
	];
	const colWidths = [35, 14, 12, 11, 28];

	const rows = pillars.map((m) => {
		const crossCutting = m.crossCuttingEdges ?? [];
		const outgoing = crossCutting.filter((e) => e.source === m.id);
		const incoming = crossCutting.filter((e) => e.target === m.id);

		const summary =
			outgoing.length > 0 || incoming.length > 0
				? `→${outgoing.length} ←${incoming.length} (${crossCutting.reduce((sum, e) => sum + e.weight, 0)} links)`
				: "—";

		return [
			m.title,
			String(m.totalEffort),
			String(m.outDegree),
			String(m.inDegree),
			summary,
		];
	});

	printTable("", headers, rows, colWidths);

	// Show cross-cutting details
	console.log(
		"\n  Cross-cutting relationships (derived from initiative connections):",
	);
	for (const pillar of pillars) {
		const crossCutting = pillar.crossCuttingEdges ?? [];
		if (crossCutting.length === 0) continue;

		const outgoing = crossCutting.filter((e) => e.source === pillar.id);
		if (outgoing.length === 0) continue;

		console.log(`\n  ${pillar.title}:`);

		// Group by target
		const byTarget = new Map<string, typeof crossCutting>();
		for (const edge of outgoing) {
			if (!byTarget.has(edge.target)) byTarget.set(edge.target, []);
			byTarget.get(edge.target)?.push(edge);
		}

		for (const [targetId, edges] of byTarget) {
			const targetPillar = graph.getNode(targetId);
			const totalWeight = edges.reduce((sum, e) => sum + e.weight, 0);
			const byType = edges.map((e) => `${e.type}(${e.weight})`).join(", ");
			console.log(
				`    → ${targetPillar?.title ?? targetId}: ${totalWeight} links [${byType}]`,
			);
		}
	}
}

function printCriticalPath(graph: RoadmapGraph) {
	const { path, totalEffort } = graph.findCriticalPath();

	console.log(`\n${"═".repeat(80)}`);
	console.log("  CRITICAL PATH ANALYSIS");
	console.log("═".repeat(80));
	console.log(`  Total effort on critical path: ${totalEffort} points`);
	console.log(`  Path length: ${path.length} nodes`);
	console.log("");
	console.log("  Critical path (dependency chain with solution breakdown):");

	for (let i = 0; i < Math.min(path.length, 10); i++) {
		const node = graph.getNode(path[i]);
		const effort = graph.getTotalEffort(path[i]);
		const prefix = i === 0 ? "  → " : "    → ";
		console.log(`${prefix}${node?.title ?? path[i]} (${effort} points total)`);

		// If this is not a solution, show the solutions underneath
		if (node && node.type !== "solution") {
			const solutions = graph
				.getAllNodes()
				.filter((n) => {
					// Find all solutions that are descendants of this node
					let current = n;
					while (current) {
						if (current.id === path[i]) return true;
						if (!current.parentId) break;
						const parentNode = graph.getNode(current.parentId);
						if (!parentNode) break;
						current = parentNode;
					}
					return false;
				})
				.filter((n) => n.type === "solution")
				.sort((a, b) => (b.baseEffort ?? 0) - (a.baseEffort ?? 0));

			// Show top solutions (or all if few)
			const displayCount = Math.min(solutions.length, 5);
			for (let j = 0; j < displayCount; j++) {
				const sol = solutions[j];
				console.log(`       • ${sol.title} (${sol.baseEffort ?? 0} points)`);
			}
			if (solutions.length > displayCount) {
				const remaining = solutions.length - displayCount;
				const remainingEffort = solutions
					.slice(displayCount)
					.reduce((sum, s) => sum + (s.baseEffort ?? 0), 0);
				console.log(
					`       • ... and ${remaining} more solutions (${remainingEffort} points)`,
				);
			}
		}
	}

	if (path.length > 10) {
		console.log(`    ... and ${path.length - 10} more nodes`);
	}
}

function printCycles(graph: RoadmapGraph) {
	const cycles = graph.findCycles();

	if (cycles.length === 0) {
		console.log("\n✓ No dependency cycles detected");
		return;
	}

	console.log(`\n${"═".repeat(60)}`);
	console.log("  ⚠️  DEPENDENCY CYCLES DETECTED");
	console.log("═".repeat(60));

	for (let i = 0; i < cycles.length; i++) {
		console.log(`\n  Cycle ${i + 1}:`);
		for (const nodeId of cycles[i]) {
			const node = graph.getNode(nodeId);
			console.log(`    → ${node?.title ?? nodeId}`);
		}
	}
}

function printClusters(graph: RoadmapGraph) {
	const clusters = graph.findClusters();

	if (clusters.size === 0) {
		console.log(
			"\n  No significant clusters found (based on RELATES_TO edges)",
		);
		return;
	}

	console.log(`\n${"═".repeat(60)}`);
	console.log("  RELATED WORK CLUSTERS (via RELATES_TO edges)");
	console.log("═".repeat(60));

	for (const [clusterId, nodeIds] of clusters) {
		console.log(`\n  ${clusterId} (${nodeIds.length} nodes):`);
		for (const nodeId of nodeIds.slice(0, 8)) {
			const node = graph.getNode(nodeId);
			console.log(`    • ${node?.title ?? nodeId}`);
		}
		if (nodeIds.length > 8) {
			console.log(`    ... and ${nodeIds.length - 8} more`);
		}
	}
}

// ============================================
// COMPLETION IMPACT ANALYSIS
// ============================================

function printCompletionImpact(impact: CompletionImpact) {
	console.log(`\n${"═".repeat(80)}`);
	console.log(`  ✓ COMPLETED: ${impact.nodeTitle}`);
	console.log("═".repeat(80));

	// Nodes now ready
	if (impact.nowReady.length > 0) {
		console.log("\n  🔓 NODES NOW UNBLOCKED:");
		const headers = ["Title", "Effort"];
		const colWidths = [60, 8];
		const rows = impact.nowReady.map((n) => [n.title, String(n.effort)]);

		printSimpleTable(headers, rows, colWidths);

		console.log(
			`\n  Total effort unblocked: ${impact.totalEffortUnblocked} points`,
		);
	} else {
		console.log("\n  No nodes were directly unblocked by this completion.");
	}

	// Effort reductions
	if (impact.effortReductions.length > 0) {
		console.log("\n  📉 EFFORT REDUCTIONS:");
		const headers = ["Title", "Old", "New", "Saved", "Reason"];
		const colWidths = [40, 5, 5, 7, 35];
		const rows = impact.effortReductions.map((r) => [
			r.title,
			String(r.oldEffort),
			String(r.newEffort),
			String(r.oldEffort - r.newEffort),
			r.reason ?? "",
		]);

		printSimpleTable(headers, rows, colWidths);

		console.log(`\n  Total effort saved: ${impact.totalEffortSaved} points`);
	}

	// Risk reductions (NEW)
	if (impact.riskReductions.length > 0) {
		console.log("\n  🛡️  RISK REDUCTIONS (tasks now safer to execute):");
		const headers = ["Title", "Risk Before", "Risk After", "Effort"];
		const colWidths = [45, 13, 12, 8];
		const rows = impact.riskReductions.map((r) => [
			r.title,
			formatNumber(r.oldRisk, 2),
			formatNumber(r.newRisk, 2),
			String(r.effort),
		]);

		printSimpleTable(headers, rows, colWidths);

		console.log(
			`\n  Total risk×effort reduced: ${formatNumber(impact.totalRiskReduced, 2)} points`,
		);
	}

	// Summary
	const totalImpact = impact.totalEffortUnblocked + impact.totalEffortSaved;
	if (totalImpact > 0 || impact.totalRiskReduced > 0) {
		console.log(`\n  ${"─".repeat(50)}`);
		console.log(`  📊 TOTAL IMPACT:`);
		console.log(
			`     Effort: ${totalImpact} points (${impact.totalEffortUnblocked} unblocked + ${impact.totalEffortSaved} saved)`,
		);
		if (impact.totalRiskReduced > 0) {
			console.log(
				`     Risk: ${formatNumber(impact.totalRiskReduced, 2)} risk×effort points mitigated`,
			);
		}
	}
}

function printSnapshot(
	snapshot: GraphSnapshot,
	label: string = "Current State",
) {
	console.log(`\n${"─".repeat(50)}`);
	console.log(`  📸 SNAPSHOT: ${label}`);
	console.log("─".repeat(50));
	console.log(`  Completed nodes: ${snapshot.completedNodes.size}`);
	console.log(`  Remaining effort: ${snapshot.totalRemainingEffort} points`);
	console.log(`    - Ready: ${snapshot.readyEffort} points`);
	console.log(`    - Blocked: ${snapshot.blockedEffort} points`);
}

function printConditionalEffortPreview(graph: RoadmapGraph, data: GraphData) {
	// Find all FACILITATES edges that reduce effort
	const facilitatesEdges = data.edges.filter((e) => e.type === "FACILITATES");

	if (facilitatesEdges.length === 0) {
		return;
	}

	const headers = ["Facilitator", "Reduces Effort Of", "Factor", "Reason"];
	const colWidths = [35, 35, 8, 40];
	const rows: string[][] = [];

	for (const edge of facilitatesEdges) {
		const sourceNode = graph.getNode(edge.source);
		const targetNode = graph.getNode(edge.target);
		if (!sourceNode || !targetNode) continue;

		rows.push([
			sourceNode.title,
			targetNode.title,
			`${Math.round((edge.factor ?? 0) * 100)}%`,
			edge.annotation ?? "",
		]);
	}

	printTable(
		"EFFORT REDUCTION EDGES (completing facilitator reduces target effort)",
		headers,
		rows,
		colWidths,
	);
}

function simulateCompletionSequence(graph: RoadmapGraph, nodeIds: string[]) {
	console.log(`\n${"═".repeat(80)}`);
	console.log("  COMPLETION SEQUENCE SIMULATION");
	console.log("═".repeat(80));

	// Take initial snapshot
	const initialSnapshot = graph.takeSnapshot();
	printSnapshot(initialSnapshot, "Before any completions");

	// Complete each node in sequence
	for (const nodeId of nodeIds) {
		const node = graph.getNode(nodeId);
		if (!node) {
			console.log(`\n  ⚠️  Node not found: ${nodeId}`);
			continue;
		}

		if (graph.isCompleted(nodeId)) {
			console.log(`\n  ⏭️  Already completed: ${node.title}`);
			continue;
		}

		const impact = graph.markCompleted(nodeId);
		printCompletionImpact(impact);
	}

	// Take final snapshot
	const finalSnapshot = graph.takeSnapshot();
	printSnapshot(finalSnapshot, "After all completions");

	// Summary comparison
	console.log(`\n${"═".repeat(50)}`);
	console.log("  SEQUENCE SUMMARY");
	console.log("═".repeat(50));
	console.log(`  Nodes completed: ${nodeIds.length}`);
	console.log(
		`  Effort before: ${initialSnapshot.totalRemainingEffort} points`,
	);
	console.log(`  Effort after: ${finalSnapshot.totalRemainingEffort} points`);
	console.log(
		`  Total reduction: ${initialSnapshot.totalRemainingEffort - finalSnapshot.totalRemainingEffort} points`,
	);
}

function printTopologicalLevels(metrics: NodeMetrics[]) {
	// Group by level
	const byLevel = new Map<number, NodeMetrics[]>();
	for (const m of metrics.filter((m) => m.type === "solution")) {
		const level = m.topoLevel;
		if (!byLevel.has(level)) byLevel.set(level, []);
		byLevel.get(level)?.push(m);
	}

	console.log(`\n${"═".repeat(60)}`);
	console.log("  TOPOLOGICAL LEVELS (execution waves)");
	console.log("═".repeat(60));

	const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
	for (const level of sortedLevels.slice(0, 5)) {
		const nodes = byLevel.get(level);
		if (!nodes) continue;
		const totalEffort = nodes.reduce((sum, n) => sum + n.directEffort, 0);
		console.log(
			`\n  Level ${level}: ${nodes.length} solutions, ${totalEffort} effort points`,
		);

		// Show top 5 by influence
		const topNodes = nodes
			.sort((a, b) => b.influenceScore - a.influenceScore)
			.slice(0, 5);

		for (const n of topNodes) {
			console.log(`    • ${n.title} (effort: ${n.directEffort})`);
		}
		if (nodes.length > 5) {
			console.log(`    ... and ${nodes.length - 5} more`);
		}
	}

	if (sortedLevels.length > 5) {
		console.log(`\n  ... and ${sortedLevels.length - 5} more levels`);
	}
}

// ============================================
// HIERARCHICAL CAPACITY PLANNING
// ============================================

function printHierarchicalPlan(
	graph: RoadmapGraph,
	metrics: NodeMetrics[],
	maxInitiatives: number = 2,
	maxProblems: number = 3,
) {
	console.log(`\n${"═".repeat(80)}`);
	console.log(
		`  HIERARCHICAL CAPACITY PLAN (${maxInitiatives} initiatives, ${maxProblems} problems each)`,
	);
	console.log("═".repeat(80));

	// Step 1: Rank initiatives
	const initiatives = metrics.filter((m) => m.type === "initiative");
	initiatives.sort((a, b) => {
		if (b.weightedBlockingCount !== a.weightedBlockingCount) {
			return b.weightedBlockingCount - a.weightedBlockingCount;
		}
		return a.dependsOnCount - b.dependsOnCount;
	});

	const selectedInitiatives = initiatives.slice(0, maxInitiatives);

	console.log("\n  📋 SELECTED INITIATIVES:");
	for (let i = 0; i < selectedInitiatives.length; i++) {
		const init = selectedInitiatives[i];
		const crossCutting = init.crossCuttingEdges ?? [];
		const pillars = new Set(
			crossCutting.map((e) => (e.source === init.id ? e.target : e.source)),
		);

		console.log(`\n  ${i + 1}. ${init.title}`);
		console.log(`     Effort: ${init.totalEffort} points`);
		console.log(`     Weighted Blocks: ${init.weightedBlockingCount}`);
		console.log(`     Dependencies: ${init.dependsOnCount}`);
		console.log(`     Cross-pillar impact: ${pillars.size} pillars`);

		// Step 2: Find problems under this initiative
		const problems = metrics.filter(
			(m) => m.type === "problem" && graph.getNode(m.id)?.parentId === init.id,
		);

		// Rank problems by weighted blocking + readiness
		problems.sort((a, b) => {
			const aScore = a.weightedBlockingCount * a.readiness;
			const bScore = b.weightedBlockingCount * b.readiness;
			if (bScore !== aScore) return bScore - aScore;
			return a.dependsOnCount - b.dependsOnCount;
		});

		const selectedProblems = problems.slice(0, maxProblems);

		if (selectedProblems.length > 0) {
			console.log(`\n     🎯 Priority problems:`);
			for (let j = 0; j < selectedProblems.length; j++) {
				const prob = selectedProblems[j];
				console.log(`        ${j + 1}. ${prob.title}`);
				console.log(
					`           Effort: ${prob.totalEffort} | Blocks: ${prob.weightedBlockingCount} | Ready: ${prob.readiness.toFixed(2)}`,
				);

				// Step 3: Find top solutions under this problem
				const solutions = metrics.filter(
					(m) =>
						m.type === "solution" && graph.getNode(m.id)?.parentId === prob.id,
				);

				solutions.sort((a, b) => b.priorityScore - a.priorityScore);
				const topSolution = solutions[0];

				if (topSolution) {
					console.log(
						`           → Start with: ${topSolution.title} (priority: ${topSolution.priorityScore.toFixed(3)})`,
					);
				}
			}
		}
	}

	console.log(`\n  ${"─".repeat(70)}`);
	console.log("  💡 Next steps:");
	console.log("     1. Break down top solutions into parallelizable tasks");
	console.log("     2. Simulate completion to see updated priorities");
	console.log(`     3. Example: yarn tsx src/main.ts simulate <solution-ids>`);
}

// ============================================
// MAIN
// ============================================

function printUsage() {
	console.log(`
Usage: yarn tsx src/main.ts [command] [options]

Commands:
  analyze [dataPath]           Run full analysis (default)
  plan [maxInit] [maxProb]     Show hierarchical capacity plan (default: 2 initiatives, 3 problems)
  report [dataPath] [output]   Generate markdown report from graph data
  complete <nodeId> [dataPath] Mark a node as completed and show impact
  preview <nodeId> [dataPath]  Preview impact of completing a node
  simulate <nodeIds> [dataPath] Simulate completing multiple nodes in sequence
  list [type] [dataPath]       List all nodes (optionally filter by type)

Examples:
  yarn tsx src/main.ts analyze
  yarn tsx src/main.ts plan
  yarn tsx src/main.ts plan 3 5
  yarn tsx src/main.ts report
  yarn tsx src/main.ts report data/roadmap-graph.json output/report.md
  yarn tsx src/main.ts complete sol-rest-contracts
  yarn tsx src/main.ts preview sol-map-dependencies
  yarn tsx src/main.ts simulate sol-map-dependencies,sol-rest-contracts,sol-api-docs
  yarn tsx src/main.ts list solution
`);
}

function main() {
	const args = process.argv.slice(2);
	const command = args[0] || "analyze";

	// Determine data path (scan args for .json file, otherwise default)
	const defaultDataPath = path.join(
		__dirname,
		"..",
		"data",
		"priority-graph.json",
	);
	const jsonArg = args.find((arg) => arg.endsWith(".json"));
	const dataPath = jsonArg || defaultDataPath;

	console.log(`Loading graph from: ${dataPath}`);

	const rawData = fs.readFileSync(dataPath, "utf-8");
	const data: GraphData = JSON.parse(rawData);

	const graph = new RoadmapGraph(data);

	switch (command) {
		case "analyze": {
			const metrics = graph.computeAllMetrics();

			printSummary(graph, data);
			printConditionalEffortPreview(graph, data);
			printPillarSummary(graph, metrics);
			printInitiativeSummary(graph, metrics);
			printInitiativePriorityRanking(graph, metrics, 15);
			printRiskMitigators(metrics, 15);
			printRiskySolutions(metrics, 15);
			printTopPrioritySolutions(metrics, 20);
			printReadySolutions(metrics, 15);
			printHighLeverageSolutions(metrics, 15);
			printBlockedSolutions(metrics, 10);
			printTopologicalLevels(metrics);
			printCriticalPath(graph);
			printCycles(graph);
			printClusters(graph);

			console.log(`\n${"═".repeat(60)}`);
			console.log("  Analysis complete");
			console.log(`${"═".repeat(60)}\n`);
			break;
		}

		case "plan": {
			const metrics = graph.computeAllMetrics();
			const maxInit =
				args[1] && !args[1].endsWith(".json") ? parseInt(args[1], 10) : 2;
			const maxProb =
				args[2] && !args[2].endsWith(".json") ? parseInt(args[2], 10) : 3;

			printHierarchicalPlan(graph, metrics, maxInit, maxProb);

			console.log(`\n${"═".repeat(60)}`);
			console.log("  Planning complete");
			console.log(`${"═".repeat(60)}\n`);
			break;
		}

		case "report": {
			const outputPath = args[1]?.endsWith(".json")
				? args[2] || path.join(__dirname, "..", "output", "report.md")
				: args[1] || path.join(__dirname, "..", "output", "report.md");

			console.log(`Generating report to: ${outputPath}`);

			const generator = new ReportGenerator(data);
			generator.writeToFile(outputPath);

			console.log("✓ Report generated successfully");
			break;
		}

		case "complete": {
			const nodeId = args[1];
			if (!nodeId || nodeId.endsWith(".json")) {
				console.error("Error: Please provide a node ID to complete");
				printUsage();
				process.exit(1);
			}

			try {
				const impact = graph.markCompleted(nodeId);
				printCompletionImpact(impact);

				// Show updated snapshot
				const snapshot = graph.takeSnapshot();
				printSnapshot(snapshot, "After completion");

				// Recalculate and show top priorities
				const metrics = graph.computeAllMetrics();
				printTopPrioritySolutions(metrics, 10);
			} catch (err) {
				console.error(`Error: ${(err as Error).message}`);
				process.exit(1);
			}
			break;
		}

		case "preview": {
			const nodeId = args[1];
			if (!nodeId || nodeId.endsWith(".json")) {
				console.error("Error: Please provide a node ID to preview");
				printUsage();
				process.exit(1);
			}

			const node = graph.getNode(nodeId);
			if (!node) {
				console.error(`Error: Node not found: ${nodeId}`);
				process.exit(1);
			}

			console.log(`\n${"═".repeat(80)}`);
			console.log(`  PREVIEW: What happens if we complete "${node.title}"?`);
			console.log("═".repeat(80));

			const impact = graph.previewCompletion(nodeId);

			if (impact.nowReady.length > 0) {
				console.log("\n  🔓 Would unblock:");
				for (const n of impact.nowReady) {
					console.log(`    • ${n.title} (effort: ${n.effort})`);
				}
			}

			if (impact.effortReductions.length > 0) {
				console.log("\n  📉 Would reduce effort for:");
				for (const r of impact.effortReductions) {
					console.log(
						`    • ${r.title}: ${r.oldEffort} → ${r.newEffort} (save ${r.oldEffort - r.newEffort})`,
					);
					if (r.reason) {
						console.log(`      Reason: ${r.reason}`);
					}
				}
			}

			console.log(`\n  ${"─".repeat(40)}`);
			console.log(
				`  📊 Total potential impact: ${impact.totalEffortUnblocked + impact.totalEffortSaved} points`,
			);
			break;
		}

		case "simulate": {
			const nodeIdsArg = args[1];
			if (!nodeIdsArg || nodeIdsArg.endsWith(".json")) {
				console.error(
					"Error: Please provide comma-separated node IDs to simulate",
				);
				printUsage();
				process.exit(1);
			}

			const nodeIds = nodeIdsArg.split(",").map((id) => id.trim());
			simulateCompletionSequence(graph, nodeIds);

			// Show final priorities
			const metrics = graph.computeAllMetrics();
			printTopPrioritySolutions(metrics, 10);
			break;
		}

		case "list": {
			const typeFilter = args[1]?.endsWith(".json") ? undefined : args[1];
			const nodes = typeFilter
				? graph.getNodesByType(typeFilter)
				: graph.getAllNodes();

			console.log(
				`\n  Found ${nodes.length} nodes${typeFilter ? ` of type '${typeFilter}'` : ""}:\n`,
			);

			// Group by type
			const byType = new Map<string, typeof nodes>();
			for (const node of nodes) {
				if (!byType.has(node.type)) byType.set(node.type, []);
				byType.get(node.type)?.push(node);
			}

			for (const [type, typeNodes] of byType) {
				console.log(`  ${type.toUpperCase()} (${typeNodes.length}):`);
				for (const node of typeNodes.slice(0, 20)) {
					const effort = graph.getDirectEffort(node.id);
					const effortStr = effort > 0 ? ` [${effort}]` : "";
					console.log(`    ${node.id}${effortStr}`);
					console.log(`      "${node.title}"`);
				}
				if (typeNodes.length > 20) {
					console.log(`    ... and ${typeNodes.length - 20} more`);
				}
				console.log("");
			}
			break;
		}

		case "help":
		case "--help":
		case "-h":
			printUsage();
			break;

		default:
			console.error(`Unknown command: ${command}`);
			printUsage();
			process.exit(1);
	}
}

main();
