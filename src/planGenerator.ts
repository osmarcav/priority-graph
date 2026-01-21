import type { RoadmapGraph } from "./graph";

export function generatePlan(graph: RoadmapGraph): string {
	const metrics = graph.computeAllMetrics();
	const lines: string[] = [];

	lines.push("## Plan of Attack");
	lines.push("");
	lines.push(
		"This plan prioritizes work based on impact, risk reduction, and dependency unblocking.",
	);
	lines.push("");

	// Filter for solutions that are not done
	const actionableParams = metrics
		.filter(
			(m) => m.type === "solution" && graph.getNode(m.id)?.status !== "done",
		)
		.sort((a, b) => b.priorityScore - a.priorityScore);

	if (actionableParams.length === 0) {
		lines.push("All solutions are completed! No pending work.");
		return lines.join("\n");
	}

	// 1. High Priority Items
	lines.push("### 🚀 High Priority (Top 5)");
	lines.push("");
	lines.push(
		"These items have the highest combination of readiness, leverage, and strategic positioning.",
	);
	lines.push("");
	lines.push("| Rank | Title | Priority | Leverage | Safety |");
	lines.push("|------|-------|----------|----------|--------|");

	actionableParams.slice(0, 5).forEach((m, index) => {
		lines.push(
			`| ${index + 1} | ${m.title} | ${m.priorityScore.toFixed(2)} | ${m.leverage.toFixed(2)} | ${(m.safetyFactor * 100).toFixed(0)}% |`,
		);
	});
	lines.push("");

	// 2. Quick Wins
	const quickWins = actionableParams
		.filter((m) => m.directEffort <= 3 && m.priorityScore > 0.4)
		.slice(0, 5);

	if (quickWins.length > 0) {
		lines.push("### ⚡ Quick Wins");
		lines.push("Low effort tasks with decent impact.");
		lines.push("");
		quickWins.forEach((m) => {
			lines.push(`- **${m.title}** (Effort: ${m.directEffort})`);
		});
		lines.push("");
	}

	// 3. Risky Bets
	const riskyBets = actionableParams
		.filter((m) => m.safetyFactor < 0.5 && m.priorityScore > 0.6)
		.slice(0, 5);

	if (riskyBets.length > 0) {
		lines.push("### ⚠️ Critical Risks");
		lines.push(
			"High priority items with low safety scores. Ensure risk mitigations are planned.",
		);
		lines.push("");
		riskyBets.forEach((m) => {
			lines.push(
				`- **${m.title}** (Safety: ${(m.safetyFactor * 100).toFixed(0)}%)`,
			);
		});
		lines.push("");
	}

	// 4. Critical Path
	const criticalPath = graph.findCriticalPath();
	if (criticalPath.path.length > 0) {
		lines.push("### 🔗 Critical Path");
		lines.push(
			`Sequence determining minimum project time (Total Effort: ${criticalPath.totalEffort}).`,
		);
		lines.push("");

		criticalPath.path.forEach((nodeId, index) => {
			const node = graph.getNode(nodeId);
			if (node && node.status !== "done") {
				lines.push(`${index + 1}. ${node.title}`);
			}
		});
	}

	return lines.join("\n");
}
