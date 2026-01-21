# Priority Graph Engine

A dependency-aware prioritization framework for engineering roadmaps. This tool uses graph algorithms to calculate optimal execution order based on dependencies, risk, impact leverage, and topological influence.

## 🧠 Core Concepts

The system models a roadmap as a directed graph with a 4-level hierarchy:
1. **Strategic Pillar**: Top-level business outcomes.
2. **Initiative**: Large programs of work.
3. **Problem**: Specific friction points or user needs.
4. **Solution**: Actionable work items (Tasks).

### Relationships (Edges)

| Edge Type        | Direction | Meaning                         | Algorithmic Impact                    |
| :--------------- | :-------- | :------------------------------ | :------------------------------------ |
| `DEPENDS_ON`     | A → B     | A cannot start until B is done  | Calculating Critical Path & Readiness |
| `BLOCKS`         | A → B     | A blocks B (Inverse of depends) | Increases "Blocking Score" (Priority) |
| `FACILITATES`    | A → B     | A makes B easier/faster         | Increases PageRank "Influence"        |
| `MITIGATES_RISK` | A → B     | A reduces the risk of B         | Adjusts "Safety Factor"               |
| `RELATES_TO`     | A ↔ B     | Contextual link                 | Cluster detection                     |

## ⚙️ Algorithms & Scoring

The engine (implemented in [`src/graph.ts`](src/graph.ts)) aggregates several metrics to determine priority.

### 1. The Priority Formula
Solutions are ranked by a composite score (0-1 scale) derived from:

$$ P = (W_r \cdot Readiness) + (W_i \cdot Influence) + (W_l \cdot Leverage) + (W_s \cdot Safety) + (W_b \cdot Blocking) + Bonus $$

- **Readiness**: Can we start now? (Based on unblocked status).
- **Influence**: Graph centrality using a PageRank-style algorithm.
- **Leverage**: Ratio of downstream effort unlocked vs. own effort.
- **Safety**: Risk avoidance ($1 - AdjustedRisk$).
- **Blocking**: Weighted count of dependent nodes (including descendants).
- **Risk Bonus**: Extra points for tasks that mitigate risk for other high-effort nodes.

### 2. Conditional Effort (Optimistic execution)
The graph supports **Effort Modifiers**. If node A `FACILITATES` node B, the effort of B can be dynamically reduced when A is completed. The engine simulates this to find "Efficiency Cascades."

### 3. Risk Propagation
Risk is modeled as a probability of failure/rework.
- **Base Risk**: Intrinsic risk of a node.
- **Adjusted Risk**: Reduced dynamically when `MITIGATES_RISK` predecessors are completed.

## 🚀 CLI Usage

The entry point is [`src/main.ts`](src/main.ts).

### Analysis
Runs the full suite of algorithms (PageRank, Topological Sort, prioritization).
```bash
yarn tsx src/main.ts analyze [path/to/data.json]
```
_Outputs: Graph Summary, Top Priorities, Risky Solutions, Critical Path, and Cycles._

### Capacity Planning
Generates a hierarchical plan limited by constraints (e.g., "Top 2 Initiatives, top 3 problems each").
```bash
yarn tsx src/main.ts plan <maxInitiatives> <maxProblems>
# Example:
yarn tsx src/main.ts plan 2 3
```

### Report Generation
Generates a human-readable Markdown Strategy document.
```bash
yarn tsx src/main.ts report [path/to/data.json] [output/path.md]
```

### Simulation & "What If"
Simulate the impact of completing specific nodes.

**Preview impact of one node:**
```bash
yarn tsx src/main.ts preview <nodeId>
```

**Simulate a sequence:**
```bash
yarn tsx src/main.ts simulate <nodeId1>,<nodeId2>,<nodeId3>
```

**Complete a node (Permanent):**
Updates the graph state to mark an item as `done`.
```bash
yarn tsx src/main.ts complete <nodeId>
```

## 📂 Code Structure

- **[`src/graph.ts`](src/graph.ts)**: Core data structure. Implements finding critical paths, calculating PageRank (influence), and managing graph state (snapshots).
- **[`src/main.ts`](src/main.ts)**: CLI Command handling and analysis output views.
- **[`src/reportGenerator.ts`](src/reportGenerator.ts)**: transforming the graph into a structured Markdown document with generated glossary and cross-references.
- **[`src/types.ts`](src/types.ts)**: TypeScript definitions for Nodes, Edges, and Metrics.
- **[`src/tableFormatter.ts`](src/tableFormatter.ts)**: Utilities for CLI table output.

## 📚 Theory
See [`references.md`](references.md) for the theoretical frameworks (WSJF, TOC, Wardley Mapping) that inspired this implementation.

---

**2. CLI Commands**

| Command    | Usage                                          | Description                     |
| ---------- | ---------------------------------------------- | ------------------------------- |
| `analyze`  | `tsx src/main.ts analyze`                      | Full analysis (default)         |
| `complete` | `tsx src/main.ts complete sol-rest-contracts`  | Mark node done, show impact     |
| `preview`  | `tsx src/main.ts preview sol-map-dependencies` | Show impact without committing  |
| `simulate` | `tsx src/main.ts simulate id1,id2,id3`         | Complete sequence, show cascade |
| `list`     | `tsx src/main.ts list solution`                | List nodes by type              |

---

**3. Impact Analysis Output**

When completing a node, you see:

- **🔓 Nodes unblocked**: Work that can now start
- **📉 Effort reductions**: Work that got cheaper
- **📊 Total impact**: Sum of unblocked + saved effort
- **📸 Snapshots**: Before/after state comparison

---

### Example: API Docs Cascade

```

sol-map-dependencies (5 pts)
↓ completes
sol-rest-contracts (8 pts) — NOW READY
sol-event-contracts (8 pts) — NOW READY
sol-dep-graph-viz: 8 → 3 pts (SAVE 5)
↓ completes sol-rest-contracts
sol-api-docs: 8 → 1 pts (SAVE 7)
```
