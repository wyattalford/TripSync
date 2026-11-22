# Notices composition

Authenticated users can view only their own in-app inbox and mark only their own notices read, one at a time or all at once. Reading a notice does not accept an invitation or change a gathering. A notice destination is a navigation path, and the destination still applies its ordinary access checks.

The endpoints are [list](reaction:OpenTime.Notices.List), [mark read](reaction:OpenTime.Notices.MarkRead), and [mark all read](reaction:OpenTime.Notices.MarkAllRead).

```endpoints
OpenTime.Notices.List at /notices/list
OpenTime.Notices.MarkRead at /notices/mark-read
OpenTime.Notices.MarkAllRead at /notices/mark-all-read
```
