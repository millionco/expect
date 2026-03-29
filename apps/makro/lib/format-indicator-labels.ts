export const getFrequencyLabel = (value: string) => {
  if (value === "monthly") {
    return "Aylık";
  }

  if (value === "quarterly") {
    return "Çeyreklik";
  }

  return value;
};

export const getUnitLabel = (value: string) => {
  if (value === "percent") {
    return "%";
  }

  if (value === "usd_mn") {
    return "Milyon USD";
  }

  if (value === "try_mn") {
    return "Milyon TL";
  }

  return value;
};
