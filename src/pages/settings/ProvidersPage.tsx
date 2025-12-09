import React from "react";
import {
    Box,
    Button,
    Card,
    Flex,
    Heading,
    HStack,
    IconButton,
    Input,
    Stack,
    Table,
    Text,
    VStack,
} from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    LuCheck,
    LuPencil,
    LuPlus,
    LuServer,
    LuTrash2,
    LuX,
} from "react-icons/lu";
import { clients } from "@/lib/grpc-clients";
import { create } from "@bufbuild/protobuf";
import {
    CreateProviderRequestSchema,
    DeleteProviderRequestSchema,
    ListProvidersRequestSchema,
    UpdateProviderRequestSchema,
} from "@/gen/sapphillon/ai/v1/provider_service_pb";
import { ProviderSchema } from "@/gen/sapphillon/ai/v1/provider_pb";
import type { Provider } from "@/gen/sapphillon/ai/v1/provider_pb";
import { Field } from "@/components/ui/field";
import { toaster } from "@/components/ui/toaster-instance";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/useI18n";

type ProviderFormData = {
    displayName: string;
    apiKey: string;
    apiEndpoint: string;
};

export function ProvidersPage() {
    const { t } = useI18n();
    const [providers, setProviders] = React.useState<Provider[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [isCreating, setIsCreating] = React.useState(false);

    // バリデーションスキーマ
    const providerFormSchema = React.useMemo(() =>
        z.object({
            displayName: z.string().min(1, t("providers.displayNameRequired")),
            apiKey: z.string().min(1, t("providers.apiKeyRequired")),
            apiEndpoint: z.string().url(t("providers.apiEndpointInvalid")),
        }), [t]);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<ProviderFormData>({
        resolver: zodResolver(providerFormSchema),
    });

    // 編集用のフォーム（テーブル内編集用）
    const {
        register: registerEdit,
        handleSubmit: handleSubmitEdit,
        reset: resetEdit,
        formState: { isSubmitting: isSubmittingEdit },
    } = useForm<ProviderFormData>({
        resolver: zodResolver(providerFormSchema),
    });

    // プロバイダ一覧の取得
    const fetchProviders = React.useCallback(async () => {
        try {
            setLoading(true);
            const request = create(ListProvidersRequestSchema, {
                pageSize: 100,
            });
            const response = await clients.provider.listProviders(request);
            setProviders(response.providers);
        } catch (error) {
            console.error("Failed to fetch providers:", error);
            toaster.create({
                title: t("providers.fetchError"),
                type: "error",
            });
        } finally {
            setLoading(false);
        }
    }, [t]);

    React.useEffect(() => {
        fetchProviders();
    }, [fetchProviders]);

    // プロバイダの作成
    const onCreateProvider = async (data: ProviderFormData) => {
        try {
            const provider = create(ProviderSchema, {
                displayName: data.displayName,
                apiKey: data.apiKey,
                apiEndpoint: data.apiEndpoint,
            });

            const request = create(CreateProviderRequestSchema, {
                provider,
            });

            await clients.provider.createProvider(request);
            toaster.create({
                title: t("providers.createSuccess"),
                type: "success",
            });
            reset();
            setIsCreating(false);
            fetchProviders();
        } catch (error) {
            console.error("Failed to create provider:", error);
            toaster.create({
                title: t("providers.createError"),
                type: "error",
            });
        }
    };

    // プロバイダの更新
    const onUpdateProvider = async (
        providerId: string,
        data: ProviderFormData,
    ) => {
        try {
            const provider = create(ProviderSchema, {
                name: providerId,
                displayName: data.displayName,
                apiKey: data.apiKey,
                apiEndpoint: data.apiEndpoint,
            });

            const request = create(UpdateProviderRequestSchema, {
                provider,
            });

            await clients.provider.updateProvider(request);
            toaster.create({
                title: t("providers.updateSuccess"),
                type: "success",
            });
            reset();
            setEditingId(null);
            fetchProviders();
        } catch (error) {
            console.error("Failed to update provider:", error);
            toaster.create({
                title: t("providers.updateError"),
                type: "error",
            });
        }
    };

    // プロバイダの削除
    const onDeleteProvider = async (providerId: string) => {
        if (!confirm(t("providers.deleteConfirm"))) {
            return;
        }

        try {
            const request = create(DeleteProviderRequestSchema, {
                name: providerId,
            });

            await clients.provider.deleteProvider(request);
            toaster.create({
                title: t("providers.deleteSuccess"),
                type: "success",
            });
            fetchProviders();
        } catch (error) {
            console.error("Failed to delete provider:", error);
            toaster.create({
                title: t("providers.deleteError"),
                type: "error",
            });
        }
    };

    // 編集開始
    const startEdit = (provider: Provider) => {
        setEditingId(provider.name);
        resetEdit({
            displayName: provider.displayName,
            apiKey: "", // セキュリティのため空にする
            apiEndpoint: provider.apiEndpoint,
        });
    };

    // 作成フォームの表示
    const startCreate = () => {
        setIsCreating(true);
        setEditingId(null);
        reset({
            displayName: "",
            apiKey: "",
            apiEndpoint: "",
        });
    };

    return (
        <Box p={6}>
            <VStack align="stretch" gap={6}>
                <Flex justify="space-between" align="center">
                    <Heading size="xl">{t("providers.title")}</Heading>
                    {!isCreating && !loading && (
                        <Button
                            colorPalette="floorp"
                            onClick={startCreate}
                        >
                            <LuPlus />
                            {t("providers.new")}
                        </Button>
                    )}
                </Flex>

                {/* 作成フォーム */}
                {isCreating && (
                    <Card.Root>
                        <Card.Header>
                            <Flex justify="space-between" align="center">
                                <Heading size="md">
                                    {t("providers.createNew")}
                                </Heading>
                                <IconButton
                                    aria-label={t("providers.cancel")}
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setIsCreating(false);
                                        reset();
                                    }}
                                >
                                    <LuX />
                                </IconButton>
                            </Flex>
                        </Card.Header>
                        <Card.Body>
                            <form onSubmit={handleSubmit(onCreateProvider)}>
                                <Stack gap={4}>
                                    <Field
                                        label={t("providers.displayName")}
                                        invalid={!!errors.displayName}
                                        errorText={errors.displayName?.message}
                                    >
                                        <Input {...register("displayName")} />
                                    </Field>

                                    <Field
                                        label={t("providers.apiKey")}
                                        invalid={!!errors.apiKey}
                                        errorText={errors.apiKey?.message}
                                    >
                                        <Input
                                            type="password"
                                            {...register("apiKey")}
                                        />
                                    </Field>

                                    <Field
                                        label={t("providers.apiEndpoint")}
                                        invalid={!!errors.apiEndpoint}
                                        errorText={errors.apiEndpoint?.message}
                                    >
                                        <Input {...register("apiEndpoint")} />
                                    </Field>

                                    <HStack justify="flex-end">
                                        <Button
                                            variant="ghost"
                                            onClick={() => {
                                                setIsCreating(false);
                                                reset();
                                            }}
                                        >
                                            {t("providers.cancel")}
                                        </Button>
                                        <Button
                                            type="submit"
                                            colorPalette="floorp"
                                            loading={isSubmitting}
                                        >
                                            {t("providers.create")}
                                        </Button>
                                    </HStack>
                                </Stack>
                            </form>
                        </Card.Body>
                    </Card.Root>
                )}

                {/* プロバイダ一覧 */}
                <Card.Root>
                    <Card.Header>
                        <Heading size="md">{t("providers.list")}</Heading>
                    </Card.Header>
                    <Card.Body p={0}>
                        {loading
                            ? <TableSkeleton rows={3} />
                            : providers.length === 0
                            ? (
                                <EmptyState
                                    icon={<LuServer />}
                                    title={t("providers.emptyTitle")}
                                    description={t(
                                        "providers.emptyDescription",
                                    )}
                                    action={{
                                        label: t("providers.emptyAction"),
                                        onClick: startCreate,
                                        icon: <LuPlus />,
                                    }}
                                />
                            )
                            : (
                                <Table.Root>
                                    <Table.Header>
                                        <Table.Row>
                                            <Table.ColumnHeader>
                                                {t("providers.displayName")}
                                            </Table.ColumnHeader>
                                            <Table.ColumnHeader>
                                                {t("providers.apiEndpoint")}
                                            </Table.ColumnHeader>
                                            <Table.ColumnHeader>
                                                {t("providers.resourceName")}
                                            </Table.ColumnHeader>
                                            <Table.ColumnHeader textAlign="right">
                                                {t("providers.operations")}
                                            </Table.ColumnHeader>
                                        </Table.Row>
                                    </Table.Header>
                                    <Table.Body>
                                        {providers.map((provider) => (
                                            <Table.Row key={provider.name}>
                                                <Table.Cell>
                                                    {editingId === provider.name
                                                        ? (
                                                            <Input
                                                                size="sm"
                                                                {...registerEdit(
                                                                    "displayName",
                                                                )}
                                                            />
                                                        )
                                                        : (
                                                            provider.displayName
                                                        )}
                                                </Table.Cell>
                                                <Table.Cell>
                                                    {editingId === provider.name
                                                        ? (
                                                            <Input
                                                                size="sm"
                                                                {...registerEdit(
                                                                    "apiEndpoint",
                                                                )}
                                                            />
                                                        )
                                                        : (
                                                            <Text
                                                                fontSize="sm"
                                                                color="fg.muted"
                                                            >
                                                                {provider
                                                                    .apiEndpoint}
                                                            </Text>
                                                        )}
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <Text
                                                        fontSize="sm"
                                                        color="fg.muted"
                                                    >
                                                        {provider.name}
                                                    </Text>
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <HStack
                                                        justify="flex-end"
                                                        gap={2}
                                                    >
                                                        {editingId ===
                                                                provider.name
                                                            ? (
                                                                <>
                                                                    <IconButton
                                                                        aria-label={t(
                                                                            "providers.save",
                                                                        )}
                                                                        size="sm"
                                                                        colorPalette="green"
                                                                        onClick={handleSubmitEdit(
                                                                            (
                                                                                data,
                                                                            ) => onUpdateProvider(
                                                                                provider
                                                                                    .name,
                                                                                data,
                                                                            ),
                                                                        )}
                                                                        loading={isSubmittingEdit}
                                                                    >
                                                                        <LuCheck />
                                                                    </IconButton>
                                                                    <IconButton
                                                                        aria-label={t(
                                                                            "providers.cancel",
                                                                        )}
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => {
                                                                            setEditingId(
                                                                                null,
                                                                            );
                                                                            resetEdit();
                                                                        }}
                                                                    >
                                                                        <LuX />
                                                                    </IconButton>
                                                                </>
                                                            )
                                                            : (
                                                                <>
                                                                    <IconButton
                                                                        aria-label={t(
                                                                            "providers.edit",
                                                                        )}
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() =>
                                                                            startEdit(
                                                                                provider,
                                                                            )}
                                                                    >
                                                                        <LuPencil />
                                                                    </IconButton>
                                                                    <IconButton
                                                                        aria-label={t(
                                                                            "providers.delete",
                                                                        )}
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        colorPalette="red"
                                                                        onClick={() =>
                                                                            onDeleteProvider(
                                                                                provider
                                                                                    .name,
                                                                            )}
                                                                    >
                                                                        <LuTrash2 />
                                                                    </IconButton>
                                                                </>
                                                            )}
                                                    </HStack>
                                                </Table.Cell>
                                            </Table.Row>
                                        ))}
                                    </Table.Body>
                                </Table.Root>
                            )}
                    </Card.Body>
                </Card.Root>
            </VStack>
        </Box>
    );
}
