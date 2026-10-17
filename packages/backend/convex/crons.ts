import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
	"purge expired guests",
	{ hours: 1 },
	internal.users.purgeExpiredGuests,
	{},
);

crons.interval(
	"purge expired guest records",
	{ hours: 1 },
	internal.records.purgeExpiredGuests,
	{},
);

export default crons;
