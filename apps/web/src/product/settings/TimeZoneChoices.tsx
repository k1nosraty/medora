import { useRef, useState } from "react";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import {
  timeZoneChoices,
  zoneSearchKey,
} from "../../../product-assets/public/medication/shared/ui/time-zone-picker.js";

interface Props {
  id: string;
  initial: string;
  device: string;
  value: string;
  onChange(zone: string): void;
}

export function TimeZoneChoices({
  id,
  initial,
  device,
  value,
  onChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [choices] = useState(() =>
    timeZoneChoices(initial, device, Date.now()),
  );
  const options = useRef<HTMLDivElement>(null);
  const optionsId = id + "-options";
  const label = t("ui.sync-search-zone");
  const key = zoneSearchKey(query);

  return (
    <>
      <label className="cabinet-search">
        <svg aria-hidden="true">
          <use href="#i-search" />
        </svg>
        <input
          id={id + "-search"}
          type="search"
          dir="auto"
          autoComplete="off"
          placeholder={label}
          aria-label={label}
          aria-controls={optionsId}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (options.current) options.current.scrollTop = 0;
          }}
        />
      </label>
      <div id={optionsId} ref={options} className="time-zone-options">
        {choices.map((choice) => (
          <label
            key={choice.zone}
            className="time-zone-option"
            hidden={!choice.key.includes(key)}
          >
            <input
              type="radio"
              name={optionsId}
              value={choice.zone}
              checked={value === choice.zone}
              onChange={() => onChange(choice.zone)}
            />
            <span className="time-zone-name">
              <bdi>{choice.title}</bdi>
              {choice.region && (
                <small className="time-zone-region">{choice.region}</small>
              )}
            </span>
            <bdi className="time-zone-offset" dir="ltr">
              {choice.offset}
            </bdi>
          </label>
        ))}
      </div>
      <p
        id={id + "-empty"}
        className="quiet"
        role="status"
        hidden={choices.some((choice) => choice.key.includes(key))}
      >
        {t("ui.sync-no-zone-found")}
      </p>
    </>
  );
}
