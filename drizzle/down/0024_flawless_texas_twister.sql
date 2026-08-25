ALTER TABLE "broadcast_recipients" DROP CONSTRAINT "broadcast_recipients_position_check";
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_position_check" CHECK ("broadcast_recipients"."position" between 0 and 99);
