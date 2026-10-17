import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
	"purge expired guests",
	{ hours: 1 },
	internal.users.purgeExpiredGuests,
	{},
);

// Cada corrida tiene un presupuesto de borrados (records.ts): corre seguido.
crons.interval(
	"purge expired guest records",
	{ minutes: 10 },
	internal.records.purgeExpiredGuests,
	{},
);

crons.interval(
	"purge sessions past retention",
	{ hours: 1 },
	internal.records.purgeOldSessions,
	{},
);

export default crons;
