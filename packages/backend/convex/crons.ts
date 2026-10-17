import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
	"purge expired guests",
	{ hours: 1 },
	internal.users.purgeExpiredGuests,
	{},
);

export default crons;
