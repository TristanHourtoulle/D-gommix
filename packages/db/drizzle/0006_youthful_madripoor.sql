CREATE TABLE "oracle_picks" (
	"game_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"predicted_winner_id" text NOT NULL,
	"predicted_souffre_douleur_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oracle_picks_game_id_user_id_pk" PRIMARY KEY("game_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "oracle_picks" ADD CONSTRAINT "oracle_picks_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oracle_picks" ADD CONSTRAINT "oracle_picks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oracle_picks" ADD CONSTRAINT "oracle_picks_predicted_winner_id_user_id_fk" FOREIGN KEY ("predicted_winner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oracle_picks" ADD CONSTRAINT "oracle_picks_predicted_souffre_douleur_id_user_id_fk" FOREIGN KEY ("predicted_souffre_douleur_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;