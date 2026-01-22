import { z } from "zod";

export const EdgeTypeSchema = z.literal([
	"DEPENDS_ON",
	"FACILITATES",
	"DERISKS",
	"INFORMS",
	"NEEDS_COORDINATION",
	"RELATES_TO",
]);

export const NodeTypeSchema = z.literal([
	"pillar",
	"initiative",
	"problem",
	"solution",
]);

export const BaseNodeSchema = z.object({
	id: z.string(),
	type: NodeTypeSchema,
	title: z.string(),
	description: z.string().optional(),
	parentId: z.string().optional(),
});

const SolutionNodeSchema = BaseNodeSchema.extend({
	type: z.literal("solution"),
	baseEffort: z.number().int().min(0),
	baseRisk: z.number().min(0).max(1),
	baseUncertainty: z.number().min(0).max(1),
});

const NodeSchema = z.discriminatedUnion("type", [
	BaseNodeSchema.extend({ type: z.literal("pillar") }),
	BaseNodeSchema.extend({ type: z.literal("initiative") }),
	BaseNodeSchema.extend({ type: z.literal("problem") }),
	SolutionNodeSchema,
]);

const BaseEdge = z.object({
	id: z.string(),
	source: z.string(),
	target: z.string(),
	annotation: z.string().optional(),
	strength: z.number().min(0).max(1).optional(),
});

const DependsOnEdge = BaseEdge.extend({
	type: z.literal("DEPENDS_ON"),
});

const FacilitatesEdge = BaseEdge.extend({
	type: z.literal("FACILITATES"),
	factor: z.number().min(0).max(1),
});

const DerisksEdge = BaseEdge.extend({
	type: z.literal("DERISKS"),
	factor: z.number().min(0).max(1),
});

const InformsEdge = BaseEdge.extend({
	type: z.literal("INFORMS"),
	factor: z.number().min(0).max(1),
});

const NeedsCoordinationEdge = BaseEdge.extend({
	type: z.literal("NEEDS_COORDINATION"),
});

const RelatesToEdge = BaseEdge.extend({
	type: z.literal("RELATES_TO"),
});

const EdgeSchema = z.discriminatedUnion("type", [
	DependsOnEdge,
	FacilitatesEdge,
	DerisksEdge,
	InformsEdge,
	NeedsCoordinationEdge,
	RelatesToEdge,
]);

const Meta = z.object({
	version: z.string(),
	title: z.string(),
	generatedAt: z.string().datetime(),
});

export const RoadmapGraphSchema = z.object({
	meta: Meta,
	nodes: z.array(NodeSchema),
	edges: z.array(EdgeSchema),
});

type RoadmapGraphType = z.infer<typeof RoadmapGraphSchema>;

const RoadmapGraphWithSemanticsSchema =
	RoadmapGraphSchema.superRefine(validateSemantics);

export function validateRoadmap(data: unknown) {
	return RoadmapGraphWithSemanticsSchema.safeParse(data);
}

export function validateSemantics(
	graph: RoadmapGraphType,
	ctx: z.RefinementCtx,
): void {
	const nodeIds = new Set(graph.nodes.map((n) => n.id));

	const idCounts = new Map<string, number>();
	graph.nodes.forEach((n) => {
		idCounts.set(n.id, (idCounts.get(n.id) || 0) + 1);
	});
	idCounts.forEach((count, id) => {
		if (count > 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Duplicate node ID: ${id} (appears ${count} times)`,
				path: ["nodes"],
			});
		}
	});

	const edgeIdCounts = new Map<string, number>();
	graph.edges.forEach((e) => {
		edgeIdCounts.set(e.id, (edgeIdCounts.get(e.id) || 0) + 1);
	});
	edgeIdCounts.forEach((count, id) => {
		if (count > 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Duplicate edge ID: ${id} (appears ${count} times)`,
				path: ["edges"],
			});
		}
	});

	graph.nodes.forEach((node) => {
		if (node.parentId && !nodeIds.has(node.parentId)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Node ${node.id} references non-existent parent: ${node.parentId}`,
				path: ["nodes"],
			});
		}
	});

	graph.edges.forEach((edge) => {
		if (!nodeIds.has(edge.source)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Edge ${edge.id} references non-existent source: ${edge.source}`,
				path: ["edges"],
			});
		}
		if (!nodeIds.has(edge.target)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Edge ${edge.id} references non-existent target: ${edge.target}`,
				path: ["edges"],
			});
		}
	});

	graph.nodes.forEach((node) => {
		if (node.type !== "pillar" && !node.parentId) {
			const hasIncomingEdge = graph.edges.some((e) => e.target === node.id);
			if (!hasIncomingEdge) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Node ${node.id} (type: ${node.type}) has no parent and no incoming edges`,
					path: ["nodes"],
				});
			}
		}
	});

	const detectCircular = (
		nodeId: string,
		visited = new Set<string>(),
	): boolean => {
		if (visited.has(nodeId)) return true;
		visited.add(nodeId);

		const node = graph.nodes.find((n) => n.id === nodeId);
		if (node?.parentId) {
			return detectCircular(node.parentId, visited);
		}
		return false;
	};

	graph.nodes.forEach((node) => {
		if (node.parentId && detectCircular(node.id)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Circular parent relationship detected involving node: ${node.id}`,
				path: ["nodes"],
			});
		}
	});
}
