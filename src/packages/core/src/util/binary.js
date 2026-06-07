export let Binary;
(function (_Binary) {
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