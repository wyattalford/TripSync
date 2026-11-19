# Groups composition

All endpoints authenticate the request cookie. The owner can create a group, invite registered users by username, and retrieve its join URL. Invitees can accept or decline. A signed-in person can explicitly join through a shared URL. The list response includes only active groups in which the requester is a member or pending invitee. Owners can remove members or close a group; nonowners can leave. Grouping owns each membership transition and rejects ineligible requests.

The group endpoints are [create](reaction:OpenTime.Groups.Create), [invite](reaction:OpenTime.Groups.Invite), [accept](reaction:OpenTime.Groups.Accept), [decline](reaction:OpenTime.Groups.Decline), [join](reaction:OpenTime.Groups.Join), [list](reaction:OpenTime.Groups.List), [link](reaction:OpenTime.Groups.Link), [leave](reaction:OpenTime.Groups.Leave), [remove](reaction:OpenTime.Groups.Remove), and [close](reaction:OpenTime.Groups.Close).

```endpoints
OpenTime.Groups.Create at /groups/create
OpenTime.Groups.Invite at /groups/invite
OpenTime.Groups.Accept at /groups/accept
OpenTime.Groups.Decline at /groups/decline
OpenTime.Groups.Join at /groups/join
OpenTime.Groups.List at /groups/list
OpenTime.Groups.Link at /groups/link
OpenTime.Groups.Leave at /groups/leave
OpenTime.Groups.Remove at /groups/remove
OpenTime.Groups.Close at /groups/close
```
