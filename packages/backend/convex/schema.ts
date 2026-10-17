import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
	careerYear,
	checklistItem,
	dimension,
	dimensionScores,
	eventType,
	evidence,
	examZone,
	instructionClarity,
	itemStatus,
	patientState,
	personality,
	role,
	sessionStatus,
	speaker,
	truth,
	verdict,
} from "./validators";

// Tablas de plan.md, sección 4 ("Datos en Convex").
// Privacidad (AGENTS.md): de cada estudiante se guarda solo alias, año de
// carrera y rol. Ni nombre real, ni correo, ni cédula, ni teléfono.
export default defineSchema({
	...authTables,

	// Reemplaza la tabla users de Convex Auth, que guardaría nombre, correo e
	// imagen del proveedor. Los usuarios los crea createOrUpdateUser en auth.ts.
	users: defineTable({
		isAnonymous: v.optional(v.boolean()),
		// Vacío hasta que el estudiante elige su alias al primer ingreso.
		alias: v.optional(v.string()),
		careerYear: v.optional(careerYear),
		role,
		createdAt: v.number(),
	}).index("by_isAnonymous_and_createdAt", ["isAnonymous", "createdAt"]),

	cases: defineTable({
		slug: v.string(),
		title: v.string(),
		patient: v.object({
			name: v.string(),
			age: v.number(),
			occupation: v.string(),
		}),
		personality,
		chiefComplaint: v.string(),
		profile: v.record(v.string(), v.string()),
		// Solo se lee desde funciones internas.
		hiddenHistory: v.record(v.string(), v.string()),
		vitals: v.object({
			pa: v.array(v.number()),
			fc: v.number(),
			fr: v.number(),
			tax: v.number(),
		}),
		exam: v.record(v.string(), examZone),
		expectedChecklist: v.array(checklistItem),
		notApplicable: v.array(v.string()),
		criticalErrors: v.array(v.string()),
		// Solo se lee desde funciones internas.
		truth,
		published: v.boolean(),
	}).index("by_slug", ["slug"]),

	sessions: defineTable({
		userId: v.id("users"),
		caseId: v.id("cases"),
		// Copia del alias al empezar; ningún otro dato personal.
		alias: v.string(),
		personalityKey: v.string(),
		personality,
		patientState,
		status: sessionStatus,
		startedAt: v.number(),
		endedAt: v.optional(v.number()),
	}).index("by_userId", ["userId"]),

	turns: defineTable({
		sessionId: v.id("sessions"),
		speaker,
		text: v.string(),
		// Milisegundos desde el inicio de la sesión.
		startMs: v.number(),
		endMs: v.number(),
		overlap: v.boolean(),
	}).index("by_sessionId_and_startMs", ["sessionId", "startMs"]),

	examActions: defineTable({
		sessionId: v.id("sessions"),
		zone: v.string(),
		maneuver: v.string(),
		clarity: instructionClarity,
		variantShown: v.optional(v.string()),
		// Hotspot -> milisegundos con la luz encima.
		hotspotTimesMs: v.optional(v.record(v.string(), v.number())),
		startMs: v.number(),
		endMs: v.optional(v.number()),
	}).index("by_sessionId", ["sessionId"]),

	vitals: defineTable({
		sessionId: v.id("sessions"),
		stepsCompleted: v.array(v.string()),
		techniqueErrors: v.array(v.string()),
		markedSystolic: v.optional(v.number()),
		markedDiastolic: v.optional(v.number()),
		// Diferencia entre lo marcado y el valor verdadero del caso.
		systolicError: v.optional(v.number()),
		diastolicError: v.optional(v.number()),
		atMs: v.number(),
	}).index("by_sessionId", ["sessionId"]),

	events: defineTable({
		sessionId: v.id("sessions"),
		type: eventType,
		atMs: v.number(),
		durationMs: v.optional(v.number()),
		// Para cambio_animo: cuánto cambió cada variable del estado y por qué.
		delta: v.optional(v.record(v.string(), v.number())),
		motivo: v.optional(v.string()),
	}).index("by_sessionId_and_atMs", ["sessionId", "atMs"]),

	reports: defineTable({
		sessionId: v.id("sessions"),
		// Dueño del informe, para controlar quién lo lee.
		userId: v.id("users"),
		scores: dimensionScores,
		total: v.number(),
		verdict,
		items: v.array(
			v.object({
				item: v.string(),
				dimension,
				status: itemStatus,
				evidence: v.array(evidence),
			}),
		),
		mistakes: v.array(
			v.object({
				tag: v.string(),
				what: v.string(),
				why: v.string(),
				nextTime: v.string(),
				critical: v.boolean(),
				evidence: v.array(evidence),
			}),
		),
		summary: v.string(),
		createdAt: v.number(),
	})
		.index("by_sessionId", ["sessionId"])
		.index("by_userId", ["userId"]),

	assets: defineTable({
		key: v.string(),
		storageId: v.id("_storage"),
		kind: v.union(v.literal("imagen"), v.literal("audio")),
		source: v.string(),
		license: v.string(),
		attribution: v.string(),
		validatedBy: v.optional(v.string()),
	}).index("by_key", ["key"]),

	// Almacenamiento de la app web mientras se migra a las tablas de arriba
	// (records.ts). data tiene la forma de los contratos de apps/web.
	records: defineTable({
		kind: v.union(
			v.literal("case"),
			v.literal("session"),
			v.literal("turn"),
			v.literal("event"),
			v.literal("exam"),
			v.literal("vitals"),
			v.literal("report"),
		),
		appId: v.string(),
		sessionId: v.optional(v.string()),
		ownerId: v.optional(v.string()),
		data: v.any(),
	})
		.index("by_kind_and_appId", ["kind", "appId"])
		.index("by_kind_and_sessionId", ["kind", "sessionId"])
		.index("by_kind_and_ownerId", ["kind", "ownerId"]),

	mistakeProfile: defineTable({
		userId: v.id("users"),
		tag: v.string(),
		count: v.number(),
		lastSeenAt: v.number(),
	}).index("by_userId_and_tag", ["userId", "tag"]),
});
