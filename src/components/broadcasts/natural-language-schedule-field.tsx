"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseNaturalLanguageSchedule } from "@/lib/natural-language-schedule";

type NaturalLanguageScheduleFieldProps = {
  defaultValue: string;
  inputId: string;
  referenceTime: string;
  timeZone: string;
};

export function NaturalLanguageScheduleField({
  defaultValue,
  inputId,
  referenceTime,
  timeZone,
}: NaturalLanguageScheduleFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(
    () => parseNaturalLanguageSchedule(value, new Date(referenceTime), timeZone),
    [referenceTime, timeZone, value],
  );
  useEffect(() => {
    inputRef.current?.setCustomValidity(parsed.error ?? "");
  }, [parsed.error]);

  return (
    <div className="field broadcast-natural-schedule">
      <label htmlFor={inputId}>When</label>
      <input
        aria-describedby={`${inputId}-interpretation`}
        aria-invalid={parsed.error ? true : undefined}
        autoComplete="off"
        id={inputId}
        maxLength={200}
        name="scheduleText"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Wednesday 3 September at 10 am"
        ref={inputRef}
        required
        value={value}
      />
      <p
        aria-live="polite"
        className={parsed.error ? "field-error" : "field-help"}
        id={`${inputId}-interpretation`}
      >
        {parsed.error ?? `Interpreted as ${parsed.label} (${timeZone}).`}
      </p>
    </div>
  );
}
