import * as React from 'react';
import { useFetchClient, useNotification, Widget } from '@strapi/admin/strapi-admin';
import { Box, Button, Table, Thead, Tbody, Tr, Th, Td, Typography, Flex } from '@strapi/design-system';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const OldestPagesWidget = () => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [pages, setPages] = React.useState(null);
  const [hasError, setHasError] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    get('/content-reports/oldest-pages')
      .then(({ data }) => {
        if (!cancelled) setPages(data);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [get]);

  const handleEmail = async () => {
    setIsSending(true);
    try {
      const { data } = await post('/content-reports/oldest-pages/email');
      toggleNotification({
        type: 'success',
        message: `Report emailed to ${data.recipient} (${data.count} page${data.count === 1 ? '' : 's'}).`,
      });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: error?.response?.data?.error?.message || 'Could not send the report email.',
      });
    } finally {
      setIsSending(false);
    }
  };

  if (hasError) {
    return <Widget.Error />;
  }

  if (!pages) {
    return <Widget.Loading />;
  }

  if (pages.length === 0) {
    return <Widget.NoData>No pages found.</Widget.NoData>;
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={3} height="100%">
      <Box overflow="auto" flex="1 1 auto">
        <Table colCount={3} rowCount={pages.length}>
          <Thead>
            <Tr>
              <Th>
                <Typography variant="sigma">Page</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">Status</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">Last modified</Typography>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {pages.map((page) => (
              <Tr key={page.documentId}>
                <Td>
                  <Typography>{page.slug}</Typography>
                </Td>
                <Td>
                  <Typography>{page.workflowStatus}</Typography>
                </Td>
                <Td>
                  <Typography>{formatDate(page.updatedAt)}</Typography>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
      <Flex justifyContent="flex-end">
        <Button onClick={handleEmail} loading={isSending} size="S">
          Email this report
        </Button>
      </Flex>
    </Flex>
  );
};

export default OldestPagesWidget;
