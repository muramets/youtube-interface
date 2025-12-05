import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TrafficUploader } from './TrafficUploader';
import { TrafficTable } from './TrafficTable';
import { GroupCreationModal } from './GroupCreationModal';
import { useSuggestedTraffic } from '../../../../hooks/useSuggestedTraffic';
import type { TrafficGroup } from '../../../../types/traffic';
import type { CTRRule } from '../../Packaging/types';
import { TrafficSelectionBar } from './TrafficSelectionBar';
import { SubTabs } from '../../../Shared/SubTabs';

interface SuggestedTrafficTabProps {
    customVideoId: string;
    packagingCtrRules: CTRRule[];
}

export const SuggestedTrafficTab: React.FC<SuggestedTrafficTabProps> = ({ customVideoId, packagingCtrRules }) => {
    const {
        trafficData,
        totalRow,
        groups,
        isLoading,
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
    } = useSuggestedTraffic(customVideoId);

    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<TrafficGroup | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<string>('all');

    // Filter ungrouped data if hideGrouped is true
    const groupedVideoIds = new Set(groups.flatMap(g => g.videoIds));

    // Determine data to show based on active tab
    const displayData = React.useMemo(() => {
        if (activeTab === 'all') {
            return hideGrouped
                ? trafficData.filter(item => item.videoId && !groupedVideoIds.has(item.videoId))
                : trafficData;
        }
        const group = groups.find(g => g.id === activeTab);
        if (!group) return [];
        return trafficData.filter(item => item.videoId && group.videoIds.includes(item.videoId));
    }, [activeTab, trafficData, groups, hideGrouped, groupedVideoIds]);



    const handleOpenEditGroup = (group: TrafficGroup) => {
        setEditingGroup(group);
        setIsGroupModalOpen(true);
    };

    const handleSaveGroup = (groupData: Omit<TrafficGroup, 'id' | 'videoIds'> & { id?: string }) => {
        handleCreateGroup(groupData);
    };

    const handleQuickCreateGroup = (name: string) => {
        // Generate a random color
        const colors = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        handleCreateGroup({ name, color: randomColor });
    };

    const activeGroup = groups.find(g => g.id === activeTab);

    if (trafficData.length === 0 && !isLoading) {
        return (
            <div className="p-6">
                <TrafficUploader onUpload={handleUpload} isLoading={isLoading} error={error} />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden relative">
            {/* Tabs */}
            <div className="z-20 bg-bg-secondary pl-[200px] pr-6 flex-shrink-0 border-b border-white/5">
                <SubTabs
                    activeTabId={activeTab}
                    onTabChange={setActiveTab}
                    tabs={[
                        { id: 'all', label: 'All Videos' },
                        ...groups.map(group => ({
                            id: group.id,
                            label: group.name,
                            color: group.color,
                            count: group.videoIds.length
                        }))
                    ]}
                />
            </div>

            <div className="flex-1 flex flex-col min-h-0 px-6 pb-6 gap-6">
                {/* Header Actions */}
                <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <TrafficUploader
                            onUpload={handleUpload}
                            isLoading={isLoading}
                            error={error}
                            isCompact
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {activeTab === 'all' && (
                            <button
                                onClick={() => setHideGrouped(!hideGrouped)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${hideGrouped ? 'bg-text-primary text-bg-primary' : 'bg-white/5 text-text-secondary hover:text-white'}`}
                            >
                                {hideGrouped ? <EyeOff size={14} /> : <Eye size={14} />}
                                {hideGrouped ? 'Showing: Unassigned' : 'Showing: All Videos'}
                            </button>
                        )}

                        {activeGroup && (
                            <>
                                <button
                                    onClick={() => handleOpenEditGroup(activeGroup)}
                                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-lg transition-colors"
                                >
                                    Edit Group
                                </button>
                                <button
                                    onClick={() => {
                                        if (confirm('Are you sure you want to delete this group?')) {
                                            handleDeleteGroup(activeGroup.id);
                                            setActiveTab('all');
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-medium rounded-lg transition-colors"
                                >
                                    Delete Group
                                </button>
                            </>
                        )}

                    </div>
                </div>

                {/* Main Table */}
                <div className="flex-1 min-h-0">
                    <TrafficTable
                        data={displayData}
                        totalRow={activeTab === 'all' ? totalRow : undefined}
                        selectedIds={selectedIds}
                        onToggleSelection={handleToggleSelection}
                        onToggleAll={handleToggleAll}
                        groups={groups}
                        onAddToGroup={handleAddToGroup}
                        packagingCtrRules={packagingCtrRules}
                    />
                </div>
            </div>

            <TrafficSelectionBar
                selectedCount={selectedIds.size}
                groups={groups}
                onAddToGroup={(groupId) => handleAddToGroup(groupId)}
                onCreateGroup={handleQuickCreateGroup}
                onClearSelection={clearSelection}
                onRemoveFromGroup={activeGroup ? () => {
                    const idsToRemove = Array.from(selectedIds);
                    handleRemoveFromGroup(activeGroup.id, idsToRemove);
                    clearSelection();
                } : undefined}
                activeGroupId={activeGroup?.id}
            />

            <GroupCreationModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                onSave={handleSaveGroup}
                initialData={editingGroup}
            />
        </div>
    );
};
