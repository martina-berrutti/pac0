import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
	"purge expired guests",
	{ hours: 1 },
	internal.users.purgeExpiredGuests,
	{},
);

// Datos de la app web (tabla records) de invitados vencidos.
crons.interval(
	"purge expired records",
	{ minutes: 15 },
	internal.records.purgeExpired,
	{},
);

export default crons;
