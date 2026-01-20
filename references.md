# Related Methodologies and Frameworks

## Direct Matches

### 1. WSJF (Weighted Shortest Job First) - SAFe Framework

- **What it is:** Cost of Delay ÷ Job Size
- **Your equivalent:** `priorityScore = (readiness × 0.3) + (influence × 0.15) + (leverage × 0.2) + (safetyFactor × 0.15) + (blockingScore × 0.2) + riskMitigationBonus`
  Where:

- `readiness` = 1 / (unmetDependencies + 1)
- `influence` = PageRank score (normalized)
- `leverage` = log-normalized(downstreamEffort / ownEffort)
- `safetyFactor` = 1 - adjustedRisk
- `blockingScore` = log-normalized(weightedBlockingCount)
- `riskMitigationBonus` = (riskMitigationValue / effort) × 0.5
- **Key overlap:** Economic prioritization, effort-weighted impact, dependency awareness

### 2. Theory of Constraints (TOC) / Critical Chain Project Management

- **Author:** Eliyahu Goldratt
- **What it is:** Identify and optimize system bottlenecks
- **Your equivalent:** `weightedBlockingCount`, `criticalPath()`, dependency-based scheduling
- **Key overlap:** Focus on what unblocks the most work

### 3. Dependency Structure Matrix (DSM)

- **What it is:** Matrix-based dependency visualization and sequencing
- **Your equivalent:** Graph's adjacency lists + derived edges for hierarchical views
- **Key overlap:** Cross-cutting relationship discovery, cluster detection

### 4. Network Analysis (Critical Path Method - CPM / PERT)

- **What it is:** Project scheduling via dependency networks
- **Your equivalent:** `findCriticalPath()`, `computeTopologicalLevels()`
- **Key overlap:** Longest path, effort aggregation, parallel work identification

## Portfolio/Strategic Planning

### 5. Portfolio Kanban - SAFe

- **What it is:** Limit WIP at portfolio level, visualize flow
- **Your equivalent:** Plan command with capacity constraints (`maxInitiatives`, `maxProblems`)
- **Key overlap:** Hierarchical WIP limits, strategic vs tactical prioritization

### 6. Wardley Mapping

- **Author:** Simon Wardley
- **What it is:** Strategic positioning map (evolution vs value chain)
- **Your equivalent:** Pillar → Initiative → Problem → Solution hierarchy with cross-cutting edges
- **Key overlap:** Dependency chains, evolution awareness (uncertainty field)

### 7. Impact Mapping

- **Author:** Gojko Adzic
- **What it is:** Goal → Actor → Impact → Deliverable hierarchy
- **Your equivalent:** 4-level hierarchy with effort/risk at leaves
- **Key overlap:** Goal decomposition, tracing impact upward

## Risk & Uncertainty

### 8. Real Options / Cost of Delay

- **Authors:** Chris Matts, Olav Maassen, Joshua Arnold
- **What it is:** Economic framework considering urgency, value, risk, and optionality
- **Your equivalent:** Risk-adjusted prioritization, `effortModifiers` (optionality), `riskMitigationValue`
- **Key overlap:** Risk quantification, exploring multiple paths

### 9. Monte Carlo Simulation for Project Planning

- **What it is:** Probabilistic scheduling using uncertainty ranges
- **Your equivalent:** Uncertainty multiplier, simulation command
- **Key overlap:** Uncertainty modeling, "what-if" analysis

## Scoring Frameworks

### 10. RICE (Reach × Impact × Confidence / Effort)

- **Source:** Intercom
- **Your equivalent:** Similar multi-factor scoring, plus readiness, leverage, safety, blocking
- **Key overlap:** Effort-normalized impact scoring

### 11. Multi-Criteria Decision Analysis (MCDA)

- **What it is:** Weighted scoring across multiple dimensions
- **Your equivalent:** Composite `priorityScore` with multiple factors
- **Key overlap:** Multi-dimensional optimization

## Academic/Research

### 12. Dependency Graph Theory

- **Field:** Software Engineering, Project Management
- **Research:** Technical debt networks, microservice dependency analysis
- **Your equivalent:** Entire graph model with edge types
- **Key overlap:** Transitive dependencies, coupling metrics, modularity

### 13. PageRank-style Influence

- **Source:** Google's PageRank algorithm
- **Your equivalent:** `computeInfluenceScores()` using graph centrality
- **Key overlap:** Importance via network position

### 14. Multi-Level Network Analysis

- **Field:** Complex systems, organizational science
- **Your equivalent:** Derived edges, hierarchical aggregation
- **Key overlap:** Cross-level relationships, emergent patterns

## What Makes Your System Unique

A hybrid framework combining:

- Economic prioritization (WSJF, Cost of Delay)
- Graph theory (CPM, DSM, PageRank)
- Risk management (Real Options, mitigation tracking)
- Hierarchical planning (Impact Mapping, Portfolio Kanban)
- Constraint optimization (TOC, Critical Chain)
- Dynamic simulation (Monte Carlo concepts)

## Closest Named Methodology

**"Risk-Adjusted Critical Chain Portfolio Kanban"** or **"Dependency-Aware Economic Prioritization Framework"**

The closest commercial product: **Atlassian's Advanced Roadmaps** or **Jira Align**

### Your system's advantages:

- Risk mitigation tracking via graph edges
- Hierarchical cross-cutting relationship discovery
- Conditional effort modifiers
- Multi-level derived metrics

## Recommended Reading

1. **"Managing Technical Debt: Reducing Friction in Software Development"** (2019) - Graph-based approaches
2. **"Dependency Structure Matrices in Software Architecture"** - DSM applications
3. **"The Principles of Product Development Flow"** by Donald Reinertsen - Economic frameworks

---

_Your implementation is a practical, code-first realization of ideas from multiple domains!_ 🎯
