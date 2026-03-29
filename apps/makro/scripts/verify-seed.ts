import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMakroData } from "../lib/get-makro-data";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.chdir(path.join(__dirname, ".."));

const verifySeed = async () => {
  const makroData = await getMakroData();

  if (makroData.counts.countries !== 1) {
    throw new Error(`Expected 1 country, received ${makroData.counts.countries}`);
  }

  if (makroData.counts.sources !== 8) {
    throw new Error(`Expected 8 sources, received ${makroData.counts.sources}`);
  }

  if (makroData.counts.indicators !== 12) {
    throw new Error(`Expected 12 indicators, received ${makroData.counts.indicators}`);
  }

  if (makroData.counts.indicatorComponents !== 52) {
    throw new Error(
      `Expected 52 indicator components, received ${makroData.counts.indicatorComponents}`,
    );
  }

  if (makroData.counts.primarySources !== 3) {
    throw new Error(
      `Expected 3 primary sources, received ${makroData.counts.primarySources}`,
    );
  }

  const policyRate = makroData.indicators.find(
    (indicator) => indicator.indicatorCode === "POLICY_RATE",
  );

  if (!policyRate) {
    throw new Error("POLICY_RATE indicator is missing");
  }

  if (policyRate.components.length !== 3) {
    throw new Error(
      `Expected 3 POLICY_RATE components, received ${policyRate.components.length}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        counts: makroData.counts,
        verifiedIndicator: policyRate.indicatorCode,
      },
      null,
      2,
    ),
  );
};

verifySeed().catch((error) => {
  console.error(error);
  process.exit(1);
});
