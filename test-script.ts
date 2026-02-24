const playlistSort = {};
const activePlaylistId = '123';
const librarySortAsc = false;
const defaultPlaylistSortAsc = true;
const musicSortAsc = playlistSort?.sortAsc ?? (activePlaylistId ? defaultPlaylistSortAsc : librarySortAsc);
console.log(musicSortAsc);
