CREATE TABLE "seals" (
	"user_id" text NOT NULL,
	"seal_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seals_user_id_seal_id_pk" PRIMARY KEY("user_id","seal_id")
);
--> statement-breakpoint
ALTER TABLE "seals" ADD CONSTRAINT "seals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seals" ADD CONSTRAINT "seals_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seals_game" ON "seals" USING btree ("game_id");