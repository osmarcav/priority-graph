```json
{
  "id": "sol-api-docs",
  "effort": 8,
  "effortModifiers": [
    {
      "whenCompleted": ["prob-hidden-dependencies"],
      "effort": 3,
      "reason": "Service mapping done, only need to wire up doc generation"
    },
    {
      "whenCompleted": ["sol-rest-contracts"],
      "effort": 1,
      "reason": "Contracts defined with Zod schemas, trivial to generate docs"
    }
  ]
}
```

**Algorithm**: Picks the **lowest effort** among all matching modifiers (most optimistic scenario).

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
