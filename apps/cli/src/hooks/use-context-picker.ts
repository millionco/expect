import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GitState, TestContext } from "@browser-tester/shared/models";
import { stripMouseSequences } from "./mouse-context.js";
import {
  buildLocalContextOptions,
  fetchRemoteContextOptions,
  filterContextOptions,
} from "../utils/context-options.js";

interface UseContextPickerOptions {
  gitState: GitState | null;
  onSelect: (option: TestContext) => void;
}

export const useContextPicker = ({ gitState, onSelect }: UseContextPickerOptions) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerIndex, setPickerIndex] = useState(0);

  const { data: localOptions = [] } = useQuery({
    queryKey: ["local-context-options", gitState?.currentBranch],
    queryFn: () => buildLocalContextOptions(gitState!),
    enabled: Boolean(gitState),
  });

  const { data: remoteOptions = [], isLoading: remoteLoading } = useQuery({
    queryKey: ["remote-context-options", gitState?.currentBranch],
    queryFn: () => fetchRemoteContextOptions(gitState!),
    enabled: pickerOpen && Boolean(gitState),
  });

  const allOptions = useMemo(
    () => [...localOptions, ...remoteOptions],
    [localOptions, remoteOptions],
  );

  const filteredOptions = useMemo(
    () => filterContextOptions(allOptions, pickerQuery, gitState),
    [allOptions, pickerQuery, gitState],
  );

  useEffect(() => {
    setPickerIndex(0);
  }, [pickerQuery]);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
    setPickerQuery("");
    setPickerIndex(0);
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerQuery("");
  }, []);

  const handleContextSelect = useCallback(
    (option: TestContext) => {
      onSelect(option);
      closePicker();
    },
    [onSelect, closePicker],
  );

  const createInputChangeHandler = (
    valueRef: React.RefObject<string>,
    setValue: (value: string) => void,
  ) => {
    const handleInputChange = (nextValue: string) => {
      const stripped = stripMouseSequences(nextValue);
      const previousValue = valueRef.current;

      if (
        stripped.length > previousValue.length &&
        stripped[stripped.length - 1] === "@" &&
        (previousValue.length === 0 || stripped[stripped.length - 2] === " ")
      ) {
        setValue(stripped.slice(0, -1));
        openPicker();
        return;
      }

      if (pickerOpen) {
        const afterAt = stripped.length - previousValue.length;
        if (afterAt < 0) {
          closePicker();
          setValue(stripped);
        } else {
          setPickerQuery((previous) => {
            const added = stripped.slice(previousValue.length);
            if (added.includes(" ")) {
              closePicker();
              setValue(stripped);
              return "";
            }
            return previous + added;
          });
        }
        return;
      }

      setValue(stripped);
    };
    return handleInputChange;
  };

  return {
    pickerOpen,
    pickerQuery,
    pickerIndex,
    filteredOptions,
    localOptions,
    remoteLoading,
    openPicker,
    closePicker,
    handleContextSelect,
    setPickerQuery,
    setPickerIndex,
    createInputChangeHandler,
  } as const;
};
