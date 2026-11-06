-- Only milestones are looked back at, so the other counted numbers go. Can take a moment on a big table
DELETE FROM "CountingEntry" WHERE "number" NOT IN (100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000, 250000000, 500000000, 1000000000);
