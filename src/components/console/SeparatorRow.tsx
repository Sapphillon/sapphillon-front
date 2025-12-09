import { Box, HStack, Text } from "@chakra-ui/react";

export interface SeparatorRowProps {
  label: string;
}

export function SeparatorRow({ label }: SeparatorRowProps) {
  return (
    <HStack align="center" my={0.5} px={{ base: 0.5, md: 1 }} color="fg.muted">
      <Box flex="1" borderTopWidth="1px" borderColor="border" />
      <Text fontSize="xs" px={{ base: 1, md: 2 }} whiteSpace="nowrap">
        {label}
      </Text>
      <Box flex="1" borderTopWidth="1px" borderColor="border" />
    </HStack>
  );
}
