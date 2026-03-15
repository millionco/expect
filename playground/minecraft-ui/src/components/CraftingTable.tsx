"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────
type ItemStack = { id: string; count: number } | null;

// ─── Constants ───────────────────────────────────────────
const S = 3; // scale factor (1 MC pixel = 3 CSS px)
const SLOT = 18 * S;
const SLOT_INNER = 16 * S;
const GUI_W = 176 * S;
const GUI_H = 166 * S;

// ─── Texture paths ───
const BLOCK_TEXTURE_PATHS: Record<
  string,
  { top: string; side: string; front: string }
> = {
  oak_log: {
    top: "/textures/oak_log_top.png",
    side: "/textures/oak_log_side.png",
    front: "/textures/oak_log_side.png",
  },
  oak_planks: {
    top: "/textures/oak_planks.png",
    side: "/textures/oak_planks.png",
    front: "/textures/oak_planks.png",
  },
};

type BlockTextures = {
  top: HTMLImageElement;
  side: HTMLImageElement;
  front: HTMLImageElement;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const renderIsometricBlock = (textures: BlockTextures): string => {
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const f = 2;

  ctx.save();
  ctx.setTransform(f, f * 0.5, 0, f, 0, 16);
  ctx.drawImage(textures.side, 0, 0, 16, 16);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(0, 0, 16, 16);
  ctx.restore();

  ctx.save();
  ctx.setTransform(-f, f * 0.5, 0, f, 64, 16);
  ctx.drawImage(textures.front, 0, 0, 16, 16);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, 0, 16, 16);
  ctx.restore();

  ctx.save();
  ctx.setTransform(f, f * 0.5, -f, f * 0.5, 32, 0);
  ctx.drawImage(textures.top, 0, 0, 16, 16);
  ctx.restore();

  return canvas.toDataURL();
};

// Dirt background uses the real texture from /textures/dirt.png
const DIRT_BG_SIZE = 16 * 4; // tile at 4x scale for the classic look

// ─── Arrow SVG (right-pointing, pixel-art Minecraft style) ────────
function ArrowIcon({ active }: { active: boolean }) {
  const white = active ? "#7DB63A" : "#C6C6C6";
  const shadow = active ? "#5E8B2A" : "#8B8B8B";
  const highlight = active ? "#8BC63F" : "#DBDBDB";

  // Pixel-art arrow: 22x15 grid, each unit = 1px in viewBox
  return (
    <svg
      width={22 * S}
      height={15 * S}
      viewBox="0 0 22 15"
      style={{ imageRendering: "pixelated" }}
    >
      {/* Shaft shadow (bottom edge) */}
      <rect x="0" y="10" width="16" height="1" fill={shadow} />
      {/* Shaft body */}
      <rect x="0" y="4" width="16" height="6" fill={white} />
      {/* Shaft highlight (top edge) */}
      <rect x="0" y="4" width="16" height="1" fill={highlight} />

      {/* Arrowhead - built pixel by pixel for authentic blocky look */}
      <rect x="13" y="3" width="1" height="1" fill={highlight} />
      <rect x="13" y="11" width="1" height="1" fill={shadow} />

      <rect x="14" y="2" width="1" height="1" fill={highlight} />
      <rect x="14" y="3" width="1" height="9" fill={white} />
      <rect x="14" y="12" width="1" height="1" fill={shadow} />

      <rect x="15" y="1" width="1" height="1" fill={highlight} />
      <rect x="15" y="2" width="1" height="11" fill={white} />
      <rect x="15" y="13" width="1" height="1" fill={shadow} />

      <rect x="16" y="0" width="1" height="1" fill={highlight} />
      <rect x="16" y="1" width="1" height="13" fill={white} />
      <rect x="16" y="14" width="1" height="1" fill={shadow} />

      <rect x="17" y="1" width="1" height="1" fill={highlight} />
      <rect x="17" y="2" width="1" height="11" fill={white} />
      <rect x="17" y="13" width="1" height="1" fill={shadow} />

      <rect x="18" y="2" width="1" height="1" fill={highlight} />
      <rect x="18" y="3" width="1" height="9" fill={white} />
      <rect x="18" y="12" width="1" height="1" fill={shadow} />

      <rect x="19" y="3" width="1" height="1" fill={highlight} />
      <rect x="19" y="4" width="1" height="7" fill={white} />
      <rect x="19" y="11" width="1" height="1" fill={shadow} />

      <rect x="20" y="4" width="1" height="1" fill={highlight} />
      <rect x="20" y="5" width="1" height="5" fill={white} />
      <rect x="20" y="10" width="1" height="1" fill={shadow} />

      <rect x="21" y="5" width="1" height="5" fill={white} />
    </svg>
  );
}

// ─── Slot Component ─────────────────────────────────────
function Slot({
  item,
  textures,
  onClick,
  onRightClick,
  large,
}: {
  item: ItemStack;
  textures: Record<string, string>;
  onClick: () => void;
  onRightClick: () => void;
  large?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const size = large ? SLOT + 8 * S : SLOT;
  const border = large ? 2 * S : S;

  return (
    <div
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onRightClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size,
        height: size,
        position: "relative",
        cursor: "pointer",
        borderTop: `${border}px solid #373737`,
        borderLeft: `${border}px solid #373737`,
        borderBottom: `${border}px solid #FFF`,
        borderRight: `${border}px solid #FFF`,
        backgroundColor: "#8B8B8B",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {hovered && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(255, 255, 255, 0.4)",
            zIndex: 10,
            pointerEvents: "none",
          }}
        />
      )}
      {item && textures[item.id] && (
        <>
          <img
            src={textures[item.id]}
            alt={item.id}
            width={SLOT_INNER}
            height={SLOT_INNER}
            draggable={false}
            style={{
              imageRendering: "pixelated",
              pointerEvents: "none",
            }}
          />
          {item.count > 1 && (
            <span
              style={{
                position: "absolute",
                bottom: 1 * S,
                right: 1 * S,
                color: "#FFF",
                fontSize: 8 * S,
                fontFamily: "monospace",
                fontWeight: "bold",
                textShadow: `${S}px ${S}px 0 #3F3F3F`,
                lineHeight: 1,
                pointerEvents: "none",
              }}
            >
              {item.count}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────
export default function CraftingTable() {
  const [itemIcons, setItemIcons] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      const icons: Record<string, string> = {};
      for (const [blockId, paths] of Object.entries(BLOCK_TEXTURE_PATHS)) {
        const [top, side, front] = await Promise.all([
          loadImage(paths.top),
          loadImage(paths.side),
          loadImage(paths.front),
        ]);
        icons[blockId] = renderIsometricBlock({ top, side, front });
      }
      setItemIcons(icons);
      setReady(true);
    };
    load();
  }, []);

  // Inventory: 36 slots (0-26 = main, 27-35 = hotbar)
  const [inventory, setInventory] = useState<ItemStack[]>(() => {
    const inv: ItemStack[] = new Array(36).fill(null);
    inv[0] = { id: "oak_log", count: 1 };
    return inv;
  });

  const [craftingGrid, setCraftingGrid] = useState<ItemStack[]>(
    new Array(9).fill(null)
  );
  const [craftingOutput, setCraftingOutput] = useState<ItemStack>(null);
  const [heldItem, setHeldItem] = useState<ItemStack>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Check crafting recipes whenever grid changes
  useEffect(() => {
    const filled = craftingGrid.filter((item) => item !== null);
    if (filled.length === 1 && filled[0]!.id === "oak_log") {
      setCraftingOutput({ id: "oak_planks", count: 4 });
    } else {
      setCraftingOutput(null);
    }
  }, [craftingGrid]);

  // ─── Click Handlers ──────────────────────────────────
  const handleSlotClick = useCallback(
    (type: "inventory" | "crafting" | "output", index: number) => {
      if (type === "output") {
        if (!craftingOutput) return;
        if (heldItem && heldItem.id !== craftingOutput.id) return;
        if (heldItem && heldItem.count + craftingOutput.count > 64) return;

        const newHeld = heldItem
          ? { ...heldItem, count: heldItem.count + craftingOutput.count }
          : { ...craftingOutput };
        setHeldItem(newHeld);

        setCraftingGrid((prev) =>
          prev.map((item) => {
            if (!item) return null;
            const n = item.count - 1;
            return n > 0 ? { ...item, count: n } : null;
          })
        );
        return;
      }

      const items =
        type === "inventory" ? [...inventory] : [...craftingGrid];
      const setItems =
        type === "inventory" ? setInventory : setCraftingGrid;
      const slot = items[index];

      if (!heldItem && !slot) return;

      if (!heldItem && slot) {
        setHeldItem(slot);
        items[index] = null;
      } else if (heldItem && !slot) {
        items[index] = heldItem;
        setHeldItem(null);
      } else if (heldItem && slot && heldItem.id === slot.id) {
        const total = slot.count + heldItem.count;
        if (total <= 64) {
          items[index] = { ...slot, count: total };
          setHeldItem(null);
        } else {
          items[index] = { ...slot, count: 64 };
          setHeldItem({ ...heldItem, count: total - 64 });
        }
      } else if (heldItem && slot) {
        items[index] = heldItem;
        setHeldItem(slot);
      }
      setItems(items);
    },
    [heldItem, inventory, craftingGrid, craftingOutput]
  );

  const handleSlotRightClick = useCallback(
    (type: "inventory" | "crafting" | "output", index: number) => {
      if (type === "output") return;

      const items =
        type === "inventory" ? [...inventory] : [...craftingGrid];
      const setItems =
        type === "inventory" ? setInventory : setCraftingGrid;
      const slot = items[index];

      if (heldItem && !slot) {
        items[index] = { id: heldItem.id, count: 1 };
        if (heldItem.count <= 1) {
          setHeldItem(null);
        } else {
          setHeldItem({ ...heldItem, count: heldItem.count - 1 });
        }
      } else if (
        heldItem &&
        slot &&
        heldItem.id === slot.id &&
        slot.count < 64
      ) {
        items[index] = { ...slot, count: slot.count + 1 };
        if (heldItem.count <= 1) {
          setHeldItem(null);
        } else {
          setHeldItem({ ...heldItem, count: heldItem.count - 1 });
        }
      } else if (!heldItem && slot) {
        const take = Math.ceil(slot.count / 2);
        setHeldItem({ id: slot.id, count: take });
        const remain = slot.count - take;
        items[index] = remain > 0 ? { ...slot, count: remain } : null;
      }
      setItems(items);
    },
    [heldItem, inventory, craftingGrid]
  );

  // ─── Render ──────────────────────────────────────────
  if (!ready) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "#000",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `url(/textures/dirt.png)`,
        backgroundSize: `${DIRT_BG_SIZE}px ${DIRT_BG_SIZE}px`,
        backgroundRepeat: "repeat",
        imageRendering: "pixelated",
        cursor: heldItem ? "none" : "default",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Dark overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.56)",
          pointerEvents: "none",
        }}
      />

      {/* GUI Panel */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: GUI_W,
          height: GUI_H,
          backgroundColor: "#C6C6C6",
          border: `${2 * S}px solid`,
          borderColor: "#FFF #555 #555 #FFF",
          padding: 0,
        }}
      >
        {/* 3x3 Crafting Grid */}
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 3 }).map((_, col) => {
            const idx = row * 3 + col;
            return (
              <div
                key={`craft-${idx}`}
                style={{
                  position: "absolute",
                  left: (30 + col * 18) * S,
                  top: (17 + row * 18) * S,
                }}
              >
                <Slot
                  item={craftingGrid[idx]}
                  textures={itemIcons}
                  onClick={() => handleSlotClick("crafting", idx)}
                  onRightClick={() =>
                    handleSlotRightClick("crafting", idx)
                  }
                />
              </div>
            );
          })
        )}

        {/* Arrow */}
        <div
          style={{
            position: "absolute",
            left: 90 * S,
            top: 35 * S,
            display: "flex",
            alignItems: "center",
          }}
        >
          <ArrowIcon active={craftingOutput !== null} />
        </div>

        {/* Output Slot */}
        <div
          style={{
            position: "absolute",
            left: 124 * S,
            top: 31 * S,
          }}
        >
          <Slot
            item={craftingOutput}
            textures={itemIcons}
            large
            onClick={() => handleSlotClick("output", 0)}
            onRightClick={() => {}}
          />
        </div>

        {/* Main Inventory (3 rows x 9 cols) */}
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 9 }).map((_, col) => {
            const idx = row * 9 + col;
            return (
              <div
                key={`inv-${idx}`}
                style={{
                  position: "absolute",
                  left: (8 + col * 18) * S,
                  top: (84 + row * 18) * S,
                }}
              >
                <Slot
                  item={inventory[idx]}
                  textures={itemIcons}
                  onClick={() => handleSlotClick("inventory", idx)}
                  onRightClick={() =>
                    handleSlotRightClick("inventory", idx)
                  }
                />
              </div>
            );
          })
        )}

        {/* Hotbar (1 row x 9 cols) */}
        {Array.from({ length: 9 }).map((_, col) => {
          const idx = 27 + col;
          return (
            <div
              key={`hot-${idx}`}
              style={{
                position: "absolute",
                left: (8 + col * 18) * S,
                top: 142 * S,
              }}
            >
              <Slot
                item={inventory[idx]}
                textures={itemIcons}
                onClick={() => handleSlotClick("inventory", idx)}
                onRightClick={() =>
                  handleSlotRightClick("inventory", idx)
                }
              />
            </div>
          );
        })}
      </div>

      {/* Held item following cursor */}
      {heldItem && itemIcons[heldItem.id] && (
        <div
          style={{
            position: "fixed",
            left: mousePos.x - SLOT_INNER / 2,
            top: mousePos.y - SLOT_INNER / 2,
            pointerEvents: "none",
            zIndex: 3000,
          }}
        >
          <img
            src={itemIcons[heldItem.id]}
            alt={heldItem.id}
            width={SLOT_INNER}
            height={SLOT_INNER}
            draggable={false}
            style={{ imageRendering: "pixelated" }}
          />
          {heldItem.count > 1 && (
            <span
              style={{
                position: "absolute",
                bottom: 0,
                right: 1 * S,
                color: "#FFF",
                fontSize: 8 * S,
                fontFamily: "monospace",
                fontWeight: "bold",
                textShadow: `${S}px ${S}px 0 #3F3F3F`,
                lineHeight: 1,
              }}
            >
              {heldItem.count}
            </span>
          )}
        </div>
      )}

    </div>
  );
}
