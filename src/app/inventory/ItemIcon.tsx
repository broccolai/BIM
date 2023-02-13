import { D2ManifestDefinitions } from 'app/destiny2/d2-definitions';
import BungieImage, { bungieBackgroundStyle, bungieNetPath } from 'app/dim-ui/BungieImage';
import BucketIcon from 'app/dim-ui/svgs/BucketIcon';
import { useD2Definitions } from 'app/manifest/selectors';
import { d2MissingIcon } from 'app/search/d2-known-values';
import { ALL_MASTERWORKED, ARMOR_COST, DEEPSIGHT, SHOW_SEASONS } from 'app/utils/broccoli-config';
import { errorLog } from 'app/utils/log';
import { isModCostVisible } from 'app/utils/socket-utils';
import {
  DestinyEnergyTypeDefinition,
  DestinyInventoryItemDefinition,
  DestinyRecordState,
} from 'bungie-api-ts/destiny2';
import clsx from 'clsx';
import { BucketHashes, ItemCategoryHashes, PlugCategoryHashes } from 'data/d2/generated-enums';
import pursuitComplete from 'images/highlightedObjective.svg';
import { DimItem } from './item-types';
import styles from './ItemIcon.m.scss';

const itemTierStyles = {
  Legendary: styles.legendary,
  Exotic: styles.exotic,
  Common: styles.basic,
  Rare: styles.rare,
  Uncommon: styles.common,
};

export function getItemImageStyles(item: DimItem, className?: string) {
  const isCapped = item.maxStackSize > 1 && item.amount === item.maxStackSize && item.uniqueStack;
  const borderless =
    (item?.destinyVersion === 2 &&
      (item.bucket.hash === BucketHashes.Subclass ||
        item.itemCategoryHashes.includes(ItemCategoryHashes.Packages))) ||
    item.isEngram;
  const useClassifiedPlaceholder = item.icon === d2MissingIcon && item.classified;
  const itemImageStyles = clsx('item-img', className, {
    [styles.complete]: item.complete || isCapped,
    [styles.borderless]: borderless,
    [styles.masterwork]: ALL_MASTERWORKED || item.masterwork,
    [styles.deepsight]: item.deepsightInfo,
    [styles.bucketIcon]: useClassifiedPlaceholder,
    [itemTierStyles[item.tier]]: !borderless && !item.plug,
  });
  return itemImageStyles;
}

/**
 * This is just the icon part of the inventory tile - without the bottom stats bar, tag icons, etc.
 * This exists because we have to do a fair bit of work to make the icon look like it does in game
 * with respect to masterwork, season icons, mod overlays, etc.
 *
 * This renders just a fragment - it always needs to be rendered inside another div with class "item".
 */
export default function ItemIcon({ item, className }: { item: DimItem; className?: string }) {
  const useClassifiedPlaceholder = item.icon === d2MissingIcon && item.classified;
  const itemImageStyles = getItemImageStyles(item, className);

  return (
    <>
      {useClassifiedPlaceholder ? (
        <BucketIcon item={item} className={itemImageStyles} />
      ) : (
        <div style={bungieBackgroundStyle(item.icon)} className={itemImageStyles} />
      )}
      {SHOW_SEASONS && item.iconOverlay && (
        <div className={styles.iconOverlay} style={bungieBackgroundStyle(item.iconOverlay)} />
      )}
      {(ALL_MASTERWORKED || item.masterwork || item.deepsightInfo) && (
        <div
          className={clsx(styles.backgroundOverlay, ALL_MASTERWORKED && styles.masterwork, {
            [styles.legendaryMasterwork]: (ALL_MASTERWORKED || item.masterwork) && !item.isExotic,
            [styles.exoticMasterwork]: (ALL_MASTERWORKED || item.masterwork) && item.isExotic,
            [styles.deepsightBorder]: item.deepsightInfo,
          })}
        />
      )}
      {ARMOR_COST && item.plug?.costElementIcon && (
        <>
          <div
            style={bungieBackgroundStyle(item.plug.costElementIcon)}
            className={styles.energyCostOverlay}
          />
          <svg viewBox="0 0 100 100" className={styles.energyCost}>
            <text x="87" y="26" fontSize="18px" textAnchor="end">
              {item.plug.energyCost}
            </text>
          </svg>
        </>
      )}
      {DEEPSIGHT &&
        item.highlightedObjective &&
        (!item.deepsightInfo || item.deepsightInfo.attunementObjective.complete) && (
          <img className={styles.highlightedObjective} src={pursuitComplete} />
        )}
      {DEEPSIGHT &&
        Boolean(
          item.deepsightInfo &&
            !item.deepsightInfo.attunementObjective.complete &&
            item.patternUnlockRecord &&
            item.patternUnlockRecord.state & DestinyRecordState.ObjectiveNotCompleted
        ) && <div className={styles.deepsightPattern} />}
    </>
  );
}

/**
 * A variant of ItemIcon that operates directly on an item definition.
 */
export function DefItemIcon({
  itemDef,
  className,
  borderless,
}: {
  itemDef: DestinyInventoryItemDefinition;
  className?: string;
  borderless?: boolean;
}) {
  const defs = useD2Definitions();
  if (!itemDef) {
    errorLog('temp-deficon', new Error('DefItemIcon was called with a missing def'));
    return null;
  }
  const itemCategoryHashes = itemDef.itemCategoryHashes || [];
  borderless ||=
    itemDef.plug?.plugCategoryHash === PlugCategoryHashes.Intrinsics ||
    itemCategoryHashes.includes(ItemCategoryHashes.Packages) ||
    itemCategoryHashes.includes(ItemCategoryHashes.Engrams);

  const itemImageStyles = clsx(
    'item-img',
    className,
    {
      [styles.borderless]: borderless,
    },
    !borderless &&
      !itemDef.plug &&
      itemDef.inventory && [itemTierStyles[itemDef.inventory.tierType]]
  );
  const modInfo = defs && getModCostInfo(itemDef, defs);

  const iconOverlay = SHOW_SEASONS
    ? itemDef.iconWatermark || itemDef.iconWatermarkShelved
    : undefined;

  return (
    <>
      <BungieImage src={itemDef.displayProperties.icon} className={itemImageStyles} alt="" />
      {iconOverlay && <BungieImage src={iconOverlay} className={styles.iconOverlay} alt="" />}
      {modInfo?.energyCostElementOverlay && (
        <>
          <div
            style={{ backgroundImage: `url("${bungieNetPath(modInfo.energyCostElementOverlay)}")` }}
            className={styles.energyCostOverlay}
          />
          <svg viewBox="0 0 100 100" className={styles.energyCost}>
            <text x="87" y="26" fontSize="18px" textAnchor="end">
              {modInfo.energyCost}
            </text>
          </svg>
        </>
      )}
    </>
  );
}

/**
 * given a mod definition or hash, returns destructurable energy cost information
 */
function getModCostInfo(mod: DestinyInventoryItemDefinition | number, defs: D2ManifestDefinitions) {
  const modCostInfo: {
    energyCost?: number;
    energyCostElement?: DestinyEnergyTypeDefinition;
    energyCostElementOverlay?: string;
  } = {};

  if (typeof mod === 'number') {
    mod = defs.InventoryItem.get(mod);
  }

  if (mod?.plug && isModCostVisible(defs, mod.plug)) {
    modCostInfo.energyCost = mod.plug.energyCost.energyCost;

    if (mod.plug.energyCost?.energyTypeHash) {
      modCostInfo.energyCostElement = defs.EnergyType.get(mod.plug.energyCost.energyTypeHash);
    }
    if (modCostInfo.energyCostElement?.costStatHash) {
      modCostInfo.energyCostElementOverlay = defs.Stat.get(
        modCostInfo.energyCostElement.costStatHash
      )?.displayProperties.icon;
    }
  }

  return modCostInfo;
}
