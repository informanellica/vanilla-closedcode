/** @file Binary-search helpers (`Binary.search`, `Binary.insert`) for arrays kept sorted by a comparable key. */
export let Binary;
(function (_Binary) {
  /**
   * Binary-searches a sorted array for an element whose comparator value equals the target id.
   * @param {Array} array - The array sorted ascending by the comparator value.
   * @param {*} id - The target comparator value to find.
   * @param {Function} compare - Maps an element to its comparable key value.
   * @returns {Object} An object with `found` (boolean) and `index` (the match index, or the insertion point when not found).
   */
  function search(array, id, compare) {
    let left = 0;
    let right = array.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midId = compare(array[mid]);
      if (midId === id) {
        return {
          found: true,
          index: mid
        };
      } else if (midId < id) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return {
      found: false,
      index: left
    };
  }
  _Binary.search = search;
  /**
   * Inserts an item into a sorted array at the position that keeps it ascending by the comparator value (mutates in place).
   * @param {Array} array - The array sorted ascending by the comparator value.
   * @param {*} item - The element to insert.
   * @param {Function} compare - Maps an element to its comparable key value.
   * @returns {Array} The same array, with the item inserted.
   */
  function insert(array, item, compare) {
    const id = compare(item);
    let left = 0;
    let right = array.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midId = compare(array[mid]);
      if (midId < id) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    array.splice(left, 0, item);
    return array;
  }
  _Binary.insert = insert;
})(Binary || (Binary = {}));