import { useState, useEffect, useCallback, useRef } from 'react';
import { VideoService } from '../services/videoService';
import type { TrafficGroup, TrafficSource } from '../types/traffic';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';

export const useSuggestedTraffic = (customVideoId: string) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const [trafficData, setTrafficData] = useState<TrafficSource[]>([]);
    const [totalRow, setTotalRow] = useState<TrafficSource | undefined>(undefined);
    const [groups, setGroups] = useState<TrafficGroup[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const selectedIdsRef = useRef(selectedIds);
    const [hideGrouped, setHideGrouped] = useState(false);

    useEffect(() => {
        selectedIdsRef.current = selectedIds;
    }, [selectedIds]);

    // Load data on mount
    useEffect(() => {
        if (!user || !currentChannel || !customVideoId) return;

        const loadData = async () => {
            setIsLoading(true);
            try {
                const data = await VideoService.fetchTrafficData(user.uid, currentChannel.id, customVideoId);
                if (data) {
                    setTrafficData(data.sources || []);
                    setGroups(data.groups || []);
                    setTotalRow(data.totalRow);
                }
            } catch (err) {
                console.error('Error loading traffic data:', err);
                setError('Failed to load traffic data');
            } finally {
                setIsLoading(false);
                setIsInitialLoading(false);
            }
        };

        loadData();
    }, [user, currentChannel, customVideoId]);

    // Save data whenever it changes (debounced ideally, but simple for now)
    const saveData = useCallback(async (newSources: TrafficSource[], newGroups: TrafficGroup[], newTotalRow?: TrafficSource) => {
        if (!user || !currentChannel || !customVideoId) return;

        try {
            await VideoService.saveTrafficData(user.uid, currentChannel.id, customVideoId, {
                lastUpdated: Date.now(),
                sources: newSources,
                groups: newGroups,
                totalRow: newTotalRow
            });
        } catch (err) {
            console.error('Error saving traffic data:', err);
            // Don't show error to user for background save, maybe toast?
        }
    }, [user, currentChannel, customVideoId]);

    const handleUpload = async (file: File) => {
        setIsLoading(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) return;

            try {
                const lines = text.split('\n');
                const parsedSources: TrafficSource[] = [];
                let parsedTotalRow: TrafficSource | undefined;

                // Simple CSV parser (assuming standard format from YouTube Analytics)
                // Header: Traffic source,Source type,Source title,Impressions,Impressions click-through rate (%),Views,Average view duration,Watch time (hours)

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    // Handle CSV escaping (quotes) - simple regex split won't work perfectly for quoted fields with commas
                    // But for this specific format, titles might have commas.
                    // Let's use a slightly better regex or logic.
                    // Fallback to simple split if regex fails or for simple lines
                    // The sample data has quotes around titles with special chars.
                    // Let's write a simple parser function.
                    const parseCSVLine = (str: string) => {
                        const result = [];
                        let current = '';
                        let inQuote = false;
                        for (let j = 0; j < str.length; j++) {
                            const char = str[j];
                            if (char === '"') {
                                inQuote = !inQuote;
                            } else if (char === ',' && !inQuote) {
                                result.push(current);
                                current = '';
                            } else {
                                current += char;
                            }
                        }
                        result.push(current);
                        return result;
                    };

                    const cols = parseCSVLine(line);
                    if (cols.length < 8) continue;

                    // Clean quotes from title
                    const clean = (s: string) => s?.replace(/^"|"$/g, '').trim();

                    const source = {
                        sourceType: clean(cols[1]),
                        sourceTitle: clean(cols[2]),
                        videoId: null as string | null, // Will extract
                        impressions: parseInt(clean(cols[3]) || '0'),
                        ctr: parseFloat(clean(cols[4]) || '0'),
                        views: parseInt(clean(cols[5]) || '0'),
                        avgViewDuration: clean(cols[6]),
                        watchTimeHours: parseFloat(clean(cols[7]) || '0')
                    };

                    const trafficSourceId = clean(cols[0]);

                    if (trafficSourceId === 'Total') {
                        parsedTotalRow = source;
                    } else if (trafficSourceId.startsWith('YT_RELATED')) {
                        // Extract Video ID
                        // Format: YT_RELATED.VIDEO_ID
                        const vidId = trafficSourceId.replace('YT_RELATED.', '');
                        source.videoId = vidId;
                        parsedSources.push(source);
                    }
                }

                // Skip API fetching as per user request
                // We rely solely on CSV data now.

                setTrafficData(parsedSources);
                setTotalRow(parsedTotalRow);
                saveData(parsedSources, groups, parsedTotalRow);

            } catch (err) {
                console.error('Error parsing CSV:', err);
                setError('Failed to parse CSV file');
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const handleToggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    const handleToggleAll = useCallback((ids: string[]) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            const allSelected = ids.every(id => newSet.has(id));

            if (allSelected) {
                ids.forEach(id => newSet.delete(id));
            } else {
                ids.forEach(id => newSet.add(id));
            }
            return newSet;
        });
    }, []);

    const handleCreateGroup = useCallback((groupData: Omit<TrafficGroup, 'id' | 'videoIds'> & { id?: string }) => {
        if (groupData.id) {
            // Edit existing
            setGroups(prevGroups => {
                const newGroups = prevGroups.map(g => g.id === groupData.id ? { ...g, ...groupData } : g);
                saveData(trafficData, newGroups, totalRow);
                return newGroups;
            });
        } else {
            // Create new
            const newGroup: TrafficGroup = {
                id: Date.now().toString(),
                name: groupData.name,
                color: groupData.color,
                videoIds: Array.from(selectedIdsRef.current)
            };
            setGroups(prevGroups => {
                const newGroups = [...prevGroups, newGroup];
                saveData(trafficData, newGroups, totalRow);
                return newGroups;
            });
            setSelectedIds(new Set()); // Clear selection
        }
    }, [trafficData, totalRow, saveData]);

    const handleDeleteGroup = useCallback((groupId: string) => {
        setGroups(prevGroups => {
            const newGroups = prevGroups.filter(g => g.id !== groupId);
            saveData(trafficData, newGroups, totalRow);
            return newGroups;
        });
    }, [trafficData, totalRow, saveData]);

    const handleAddToGroup = useCallback((groupId: string, videoIds?: string[]) => {
        const idsToAdd = videoIds || Array.from(selectedIdsRef.current);
        if (idsToAdd.length === 0) return;

        setGroups(prevGroups => {
            const newGroups = prevGroups.map(g => {
                if (g.id === groupId) {
                    // Add selected IDs to this group, avoiding duplicates
                    const newIds = new Set([...g.videoIds, ...idsToAdd]);
                    return { ...g, videoIds: Array.from(newIds) };
                }
                return g;
            });
            saveData(trafficData, newGroups, totalRow);
            return newGroups;
        });
        setSelectedIds(new Set());
    }, [trafficData, totalRow, saveData]);

    const handleRemoveFromGroup = useCallback((groupId: string, videoIdsToRemove: string[]) => {
        setGroups(prevGroups => {
            const newGroups = prevGroups.map(g => {
                if (g.id === groupId) {
                    return { ...g, videoIds: g.videoIds.filter(id => !videoIdsToRemove.includes(id)) };
                }
                return g;
            });
            saveData(trafficData, newGroups, totalRow);
            return newGroups;
        });
    }, [trafficData, totalRow, saveData]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    return {
        trafficData,
        totalRow,
        groups,
        isLoading,
        isInitialLoading,
        error,
        selectedIds,
        hideGrouped,
        setHideGrouped,
        handleUpload,
        handleToggleSelection,
        handleToggleAll,
        clearSelection,
        handleCreateGroup,
        handleDeleteGroup,
        handleAddToGroup,
        handleRemoveFromGroup
    };
};
