## Problem Statement

### Domain

The domain is informal social planning among people who already know each other. Friends often want to get dinner, watch a movie, or spend an evening together between classes, work, and other commitments. One person may suggest an activity in a group chat or ask a few friends whether they are around. The group then needs to find a suitable time, decide who is joining, and establish whether the gathering is actually happening.

The primary stakeholders are friends who want to spend time together without making every small gathering require extensive planning. They want opportunities to see each other while retaining flexibility and control over their personal time. Free time, willingness to socialize, and commitment to a particular gathering are separate things. Friends may spend an evening apart because each assumes the others are unavailable, even when everyone would welcome an invitation. Sharing a calendar can expose more of someone's schedule while still leaving that willingness unclear.

### Stakeholders

- **Person initiating a plan:** Suggests a gathering and wants to find interested friends without repeatedly asking each person when they are available.
- **Invited friend(s):** Decide whether to join and need to understand the proposed time and activity before committing.
- **Friends outside the planning channel:** May be left out when invitations circulate through a particular app or group chat they do not use.

### Bad Situations

The following scenarios illustrate the situations we aim to address.

1. **Friends have overlapping availability, but a tentative plan never becomes a gathering.** On Thursday, John, Walker, Eli, and Noah discuss watching Star Wars on Friday. Everyone expresses interest, but their replies arrive at different times and nobody establishes a start time. On Friday afternoon, John asks, “Are we doing this?” Two friends are still in class, and the conversation stalls. John has already followed up and does not want to keep pushing a casual invitation. The others wait for someone to announce a definite plan. By evening, each assumes the others have become busy, and they spend the evening separately at home. On Saturday, they discover that all four had been willing and available from 7 to 10 PM. Each person's silence had concealed an opportunity that everyone wanted.

2. **Two friends want company, but neither knows an invitation would be welcome.** Eli finishes an assignment earlier than expected and has two hours before his next commitment. He would like to get dinner with a friend, but his last few invitations reached people who were busy. Rather than message several people again, he eats alone. Noah spends the same period looking for something to do but assumes Eli is still working. When they talk that night, they realize they both were free and would've loved to hang out. Neither had a specific plan to announce, and each person's willingness remained invisible to the other.

3. **An empty calendar creates a misleading expectation of availability.** Walker shares his calendar with John to make arranging gatherings easier. John sees no events on Wednesday evening and suggests watching a movie. Walker had intended to use that time to study and rest, so he declines. John asks which other calendar gaps would work, leaving Walker to explain the purpose of his unscheduled time. After several similar exchanges, Walker stops sharing his calendar. Walker now feels that declining an invitation requires defending how he spends his unscheduled time. Sharing his calendar has made his schedule more visible without making it easier to communicate when he actually wants to hang out with friends.

### Solution Sketch

Create a simple-to-use app that allows users to share times they are willing to meet with their group and plan out gatherings accordingly. This is different than times when one is simply available, as an open time slot does not necessarily imply willingness and a commitment to gather. Users can create and be part of several different groups depending on who they want to hang out with. After everyone in the party shares their availibilities, anyone is free to send out invitations for an event they have in mind. Users can accept/decline invitations, and the users have the final say on whether to officially add the event to their schedule after a group discussion.

To avoid the problems of group chats and scheduling polls, users only create one set of availibility times, so that there is no need to manually reenter ones' times across different events and groups. Users can update their times at any point, and the app will reflect this change across all groups, finding new available times for the group to meet. 

### Ethical Analysis

1. **Insight 1**
  - **Observation**:
    - **Dimension**: Stakeholders
    - **Prompt**: For the plan initiator stakeholder role, note at least one concern specific to that role.
    - **Feature**: Event invitation acceptance
    - **Consequence**: A huge consequence is frequently having no-shows at planned events, which can be costly in the worst case.
  - **Design Response**: Although it is impossible to predict if someone will show up to an event, the app could support a feature that will allow users to tag no-shows after every event for future reference. In addition, the plan initiator is always free to create a new group without the no-show.
2. **Insight 2**
  - **Observation**:
    - **Dimension**: Stakeholders
    - **Prompt**: For the invitee stakeholder role, note at least one concern specific to that role.
    - **Feature**: Event invitation acceptance
    - **Consequence**: A huge consequence is having a schedule change at the last minute that prevents the invitee from attending an event that has already been added to the group schedule.
  - **Design Response**: Add a feature where invitees can cancel events in their schedule, notifying everyone in the group of this change.
3. **Insight 3**
  - **Observation**:
    - **Dimension**: Time
    - **Prompt**: Visualize one lifestyle change that could be supported by your technology.
    - **Feature**: Adding open times
    - **Consequence**: A consequence is being forced to create a more structured day. Since the times one enters are times they are willing to meet, users might have to think more about when they want alone time rather than it just being any time they are free. They must now anticipate for invites sent during those previous alone times. 
  - **Design Response**: Allow users to tag times with various levels of willingness to meet rather than just a binary variable (will vs. won't meet).
4. **Insight 4**
  - **Observation**:
    - **Dimension**: Time
    - **Prompt**: Imagine five years out from now and consider how the system might influence friendships and family relationships.
    - **Feature**: Event scheduling
    - **Consequence**: A positive consequence is strengthening friend and family relationships, as our app encourages people to meet together and has a higher rate of success than the current methods.
  - **Design Response**: To enforce group gatherings, we can add a new feature that recommends events for groups to do together. These recommendations should not crowd the screen as users should still be at the center of deciding what they want to do, but will rather appear as suggestions.
5. **Insight 5**
  - **Observation**:
    - **Dimension**: Values
    - **Prompt**: Deliberate on and then designate a couple primary values the system ideally would support.
    - **Feature**: Many; event scheduling and adding open times
    - **Consequence**: Consequences of these features in terms of the primary values include encouraging connection through group gatherings and privacy protection as one does not need to share every detail of their personal calendar.
  - **Design Response**: To encourage attendance and connection at gatherings, the app will create a personal schedule for the user with events that have been accepted and confirmed. To further enforce privacy, instead of just hiding the events a user has in their calendar, we also hide one's available times so that they are only viewable to the user.
6. **Insight 6**
  - **Observation**:
    - **Dimension**: Pervasiveness
    - **Prompt**: Envision your system with 1, 100, 1000, and 100,000 stakeholders. What new interactions might emerge from widespread use?
    - **Feature** Group creation
    - **Consequence**: With thousands of stakeholders, interactions may arise that are not just between in-person friend groups. For example, scheduling the best time to host a review session for a class. Manually adding everyone to a group is tedious.
  - **Design Response**: Support a feature that creates an invitation link for groups to avoid unnecessary manual work. 