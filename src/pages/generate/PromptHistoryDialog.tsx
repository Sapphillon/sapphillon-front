import React from "react";
import {
  Badge,
  Box,
  Button,
  Dialog,
  HStack,
  IconButton,
  Input,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import { LuClock, LuSearch, LuStar, LuTrash2, LuX } from "react-icons/lu";
import type { PromptHistoryItem } from "@/hooks/usePromptHistory";
import { EmptyState } from "@/components/ui/empty-state";
import { useI18n } from "@/hooks/useI18n";

interface PromptHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  history: PromptHistoryItem[];
  starredHistory: PromptHistoryItem[];
  onSelectPrompt: (prompt: string) => void;
  onRemove: (id: string) => void;
  onToggleStar: (id: string) => void;
  onClear: () => void;
}

function HistoryItem({
  item,
  onSelect,
  onRemove,
  onToggleStar,
}: {
  item: PromptHistoryItem;
  onSelect: () => void;
  onRemove: () => void;
  onToggleStar: () => void;
}) {
  const { t } = useI18n();
  const formattedDate = React.useMemo(() => {
    const date = new Date(item.timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("common.time.justNow");
    if (diffMins < 60) return t("common.time.minutesAgo", { count: diffMins });
    if (diffHours < 24) return t("common.time.hoursAgo", { count: diffHours });
    if (diffDays < 7) return t("common.time.daysAgo", { count: diffDays });

    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }, [item.timestamp, t]);

  return (
    <Box
      p={3}
      borderWidth="1px"
      rounded="md"
      bg="bg"
      cursor="pointer"
      _hover={{ bg: "bg.subtle", borderColor: "accent.emphasized" }}
      onClick={onSelect}
      position="relative"
    >
      <VStack align="stretch" gap={2}>
        <HStack justify="space-between" gap={2}>
          <HStack gap={1} flex="1" minW={0}>
            <LuClock size={14} color="var(--chakra-colors-fg-muted)" />
            <Text fontSize="xs" color="fg.muted" truncate>
              {formattedDate}
            </Text>
          </HStack>
          <HStack gap={1}>
            <IconButton
              aria-label={item.starred
                ? t("history.removeFromFavorites")
                : t("history.addToFavorites")}
              size="xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar();
              }}
              color={item.starred ? "yellow.500" : "fg.muted"}
            >
              <LuStar fill={item.starred ? "currentColor" : "none"} />
            </IconButton>
            <IconButton
              aria-label={t("history.delete")}
              size="xs"
              variant="ghost"
              colorPalette="red"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <LuTrash2 />
            </IconButton>
          </HStack>
        </HStack>
        <Text
          fontSize="sm"
          css={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.prompt}
        </Text>
      </VStack>
    </Box>
  );
}

export function PromptHistoryDialog({
  open,
  onClose,
  history,
  starredHistory,
  onSelectPrompt,
  onRemove,
  onToggleStar,
  onClear,
}: PromptHistoryDialogProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<"all" | "starred">("all");

  const filteredHistory = React.useMemo(() => {
    const items = activeTab === "starred" ? starredHistory : history;
    if (!searchQuery.trim()) return items;

    const query = searchQuery.toLowerCase();
    return items.filter((item) => item.prompt.toLowerCase().includes(query));
  }, [history, starredHistory, searchQuery, activeTab]);

  const handleSelect = React.useCallback(
    (prompt: string) => {
      onSelectPrompt(prompt);
      onClose();
    },
    [onSelectPrompt, onClose],
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      size={{ base: "full", md: "lg" }}
      modal={true}
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content
          maxW={{ base: "100vw", md: "600px" }}
          maxH={{ base: "100vh", md: "80vh" }}
        >
          <Dialog.Header>
            <HStack justify="space-between" w="full">
              <Text fontWeight="medium" fontSize={{ base: "md", md: "lg" }}>
                {t("history.title")}
              </Text>
              <Dialog.CloseTrigger asChild>
                <IconButton
                  aria-label={t("history.close")}
                  variant="ghost"
                  size="sm"
                >
                  <LuX />
                </IconButton>
              </Dialog.CloseTrigger>
            </HStack>
          </Dialog.Header>

          <Dialog.Body p={0} display="flex" flexDir="column" minH="400px">
            {/* タブとアクション */}
            <Box px={4} pt={2} pb={3} borderBottomWidth="1px">
              <HStack gap={2} mb={3}>
                <Button
                  size="sm"
                  variant={activeTab === "all" ? "solid" : "ghost"}
                  onClick={() => setActiveTab("all")}
                  flex="1"
                >
                  {t("history.all")}
                  {history.length > 0 && (
                    <Badge ml={1} size="xs">
                      {history.length}
                    </Badge>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant={activeTab === "starred" ? "solid" : "ghost"}
                  onClick={() => setActiveTab("starred")}
                  flex="1"
                >
                  <LuStar size={14} />
                  {t("history.starred")}
                  {starredHistory.length > 0 && (
                    <Badge ml={1} size="xs">
                      {starredHistory.length}
                    </Badge>
                  )}
                </Button>
              </HStack>

              {/* 検索バー */}
              <HStack
                borderWidth="1px"
                rounded="md"
                px={3}
                py={1}
                gap={2}
                bg="bg"
                _focusWithin={{
                  outline: "2px solid",
                  outlineColor: "accent.focusRing",
                }}
              >
                <LuSearch size={16} color="var(--chakra-colors-fg-muted)" />
                <Input
                  placeholder={t("history.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="sm"
                  flex="1"
                  border="none"
                  outline="none"
                  bg="transparent"
                />
                {searchQuery && (
                  <IconButton
                    aria-label={t("history.clear")}
                    size="xs"
                    variant="ghost"
                    onClick={() => setSearchQuery("")}
                  >
                    <LuX />
                  </IconButton>
                )}
              </HStack>
            </Box>

            {/* 履歴リスト */}
            <Box flex="1" overflowY="auto" p={4}>
              {filteredHistory.length === 0
                ? (
                  <EmptyState
                    icon={<LuClock />}
                    title={searchQuery
                      ? t("history.noSearchResults")
                      : activeTab === "starred"
                      ? t("history.noStarred")
                      : t("history.noHistory")}
                    description={searchQuery
                      ? t("history.noSearchResultsDescription")
                      : activeTab === "starred"
                      ? t("history.noStarredDescription")
                      : t("history.noHistoryDescription")}
                  />
                )
                : (
                  <VStack align="stretch" gap={2}>
                    {filteredHistory.map((item) => (
                      <HistoryItem
                        key={item.id}
                        item={item}
                        onSelect={() => handleSelect(item.prompt)}
                        onRemove={() => onRemove(item.id)}
                        onToggleStar={() => onToggleStar(item.id)}
                      />
                    ))}
                  </VStack>
                )}
            </Box>

            {/* フッター */}
            {history.length > 0 && (
              <>
                <Separator />
                <Box px={4} py={3}>
                  <Button
                    size="sm"
                    variant="outline"
                    colorPalette="red"
                    onClick={onClear}
                    w="full"
                  >
                    <LuTrash2 />
                    {t("history.clearAll")}
                  </Button>
                </Box>
              </>
            )}
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
