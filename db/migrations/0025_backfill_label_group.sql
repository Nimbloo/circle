UPDATE "label" SET "group_id" = 'kind'
	WHERE "id" IN ('bug','feature','refactor','documentation') AND "group_id" IS NULL;
